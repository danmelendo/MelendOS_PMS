// Bookings from the hotel's previous system (a spreadsheet exported as CSV),
// for its onboarding: one row per booking. Same reading rules as the rooms
// sheet (";" or ",", decimal comma, quotes, BOM), dates as dd/mm/aaaa or
// aaaa-mm-dd.
//
//   establecimiento;habitación;entrada;salida;huéspedes;nombre;email;teléfono;total;pagado;pago;estado;referencia;notas
//   Hostal Ejemplo;2;15/10/2026;18/10/2026;2;Laura Gómez;laura@example.com;600000000;180;180;online;;BK-1234;Cuna
import { isYmd, type Ymd } from "../domain/dates.ts";
import { amount, cells, plain } from "./csv.ts";

export interface CsvReservation {
  row: number;
  property: string;
  room: string;
  checkIn: Ymd;
  checkOut: Ymd;
  guests: number;
  name: string;
  email: string | null;
  phone: string | null;
  total: number;
  paid: number;
  paymentMode: "prepay" | "at_hotel";
  cancelled: boolean;
  reference: string | null;
  notes: string | null;
}

const COLUMNS: Record<string, keyof CsvReservation> = {
  establecimiento: "property",
  habitacion: "room",
  entrada: "checkIn",
  llegada: "checkIn",
  salida: "checkOut",
  huespedes: "guests",
  personas: "guests",
  nombre: "name",
  email: "email",
  telefono: "phone",
  total: "total",
  pagado: "paid",
  pago: "paymentMode",
  "forma de pago": "paymentMode",
  estado: "cancelled",
  referencia: "reference",
  notas: "notes",
};

/** dd/mm/aaaa, d/m/aa or aaaa-mm-dd → aaaa-mm-dd (null if it is not a date). */
export function csvDate(v: string): Ymd | null {
  const s = v.trim();
  if (isYmd(s)) return s;
  const m = (s as string).match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  const ymd = `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(`${ymd}T12:00:00Z`);
  return isYmd(ymd) && d.toISOString().slice(0, 10) === ymd ? (ymd as Ymd) : null;
}

export function reservationsFromCsv(text: string): {
  reservations: CsvReservation[];
  problems: string[];
} {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 2) return { reservations: [], problems: ["La hoja está vacía"] };
  const sep =
    (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = cells(lines[0], sep).map((h) => COLUMNS[plain(h)]);
  const problems: string[] = [];
  const required: [keyof CsvReservation, string][] = [
    ["property", "establecimiento"],
    ["room", "habitación"],
    ["checkIn", "entrada"],
    ["checkOut", "salida"],
    ["guests", "huéspedes"],
    ["name", "nombre"],
    ["total", "total"],
  ];
  for (const [key, label] of required)
    if (!header.includes(key)) problems.push(`Falta la columna «${label}»`);
  if (problems.length) return { reservations: [], problems };

  const reservations: CsvReservation[] = [];
  lines.slice(1).forEach((line, i) => {
    const row = i + 2;
    const v: Partial<Record<keyof CsvReservation, string>> = {};
    cells(line, sep).forEach((c, j) => {
      if (header[j]) v[header[j]!] = c;
    });
    const bad = (msg: string) => problems.push(`Fila ${row}: ${msg}`);
    const checkIn = csvDate(v.checkIn ?? "");
    const checkOut = csvDate(v.checkOut ?? "");
    const guests = Number(v.guests);
    const total = amount(v.total ?? "");
    const paid = amount(v.paid ?? "") ?? 0;
    const mode = plain(v.paymentMode ?? "");
    const state = plain(v.cancelled ?? "");
    const email = (v.email ?? "").trim().toLowerCase() || null;
    if (!v.property || !v.room) bad("faltan el establecimiento o la habitación");
    if (!checkIn) bad(`fecha de entrada no válida: «${v.checkIn ?? ""}»`);
    if (!checkOut) bad(`fecha de salida no válida: «${v.checkOut ?? ""}»`);
    if (checkIn && checkOut && checkOut <= checkIn)
      bad("la salida tiene que ser posterior a la entrada");
    if (!Number.isInteger(guests) || guests < 1 || guests > 12)
      bad("huéspedes tiene que ser un número de 1 a 12");
    if (!(v.name ?? "").trim()) bad("falta el nombre del huésped");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad(`email no válido: «${email}»`);
    if (total === undefined || !(total >= 0)) bad("total no válido");
    if (!(paid >= 0) || (total !== undefined && paid > total))
      bad("pagado no válido (entre 0 y el total)");
    if (mode && !["online", "tarjeta", "hotel", "en el hotel", "establecimiento"].includes(mode))
      bad(`forma de pago «${v.paymentMode}» desconocida (online o hotel)`);
    if (state && !["confirmada", "cancelada"].includes(state))
      bad(`estado «${v.cancelled}» desconocido (confirmada o cancelada)`);
    reservations.push({
      row,
      property: (v.property ?? "").trim(),
      room: (v.room ?? "").trim(),
      checkIn: (checkIn ?? "") as Ymd,
      checkOut: (checkOut ?? "") as Ymd,
      guests,
      name: (v.name ?? "").trim(),
      email,
      phone: (v.phone ?? "").trim() || null,
      total: total ?? 0,
      paid,
      paymentMode: ["online", "tarjeta"].includes(mode) ? "prepay" : "at_hotel",
      cancelled: state === "cancelada",
      reference: (v.reference ?? "").trim() || null,
      notes: (v.notes ?? "").trim() || null,
    });
  });
  return { reservations, problems };
}

/** Status of an imported booking on a given day (yyyy-mm-dd, hotel time). */
export function importedStatus(
  r: Pick<CsvReservation, "checkIn" | "checkOut" | "cancelled">,
  today: Ymd,
): "cancelled" | "completed" | "in_progress" | "confirmed" {
  if (r.cancelled) return "cancelled";
  if (r.checkOut <= today) return "completed";
  if (r.checkIn <= today) return "in_progress";
  return "confirmed";
}
