// Rooms and rates from a spreadsheet (Excel → "CSV UTF-8"), for the hotel's
// onboarding: one row per room. Accepts what a Spanish Excel writes: ";" or
// "," as separator, decimal comma, quotes and a BOM.
//
//   establecimiento;habitación;capacidad;tipo;tarifa;precio;precio fin de semana;características
//   Hostal Ejemplo;1;1;habitación;Individual;45;55;wifi
//   Hostal Ejemplo;5;3;familiar;Triple;78;;wifi, ac

export interface CsvRoom {
  property: string;
  name: string;
  capacity: number;
  type: "room" | "suite" | "family";
  rate: string;
  features: string[];
}

export interface CsvRate {
  name: string;
  price: number;
  weekend_price?: number;
}

const TYPES: Record<string, CsvRoom["type"]> = {
  room: "room",
  habitacion: "room",
  doble: "room",
  individual: "room",
  suite: "suite",
  family: "family",
  familiar: "family",
};

export const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/** Splits one CSV line (quotes allowed, "" inside quotes). */
export function cells(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** "60,50" or "60.50" or "1.060,50" → number; "" → undefined. */
export function amount(v: string): number | undefined {
  if (!v) return undefined;
  const s = v.replace(/[€\s]/g, "");
  const n = Number(
    /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, ""),
  );
  return Number.isFinite(n) ? n : NaN;
}

const COLUMNS: Record<string, keyof CsvRoom | "price" | "weekend_price"> = {
  establecimiento: "property",
  habitacion: "name",
  capacidad: "capacity",
  tipo: "type",
  tarifa: "rate",
  precio: "price",
  "precio fin de semana": "weekend_price",
  caracteristicas: "features",
};

export function roomsFromCsv(text: string): {
  rooms: CsvRoom[];
  rates: CsvRate[];
  problems: string[];
} {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const problems: string[] = [];
  if (lines.length < 2) return { rooms: [], rates: [], problems: ["La hoja está vacía"] };
  const sep =
    (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = cells(lines[0], sep).map((h) => COLUMNS[plain(h)]);
  for (const need of ["property", "name", "capacity", "rate", "price"] as const) {
    if (!header.includes(need)) {
      const label = Object.entries(COLUMNS).find(([, v]) => v === need)![0];
      problems.push(`Falta la columna «${label}»`);
    }
  }
  if (problems.length) return { rooms: [], rates: [], problems };

  const rooms: CsvRoom[] = [];
  const rates = new Map<string, CsvRate>();
  lines.slice(1).forEach((line, i) => {
    const row = i + 2;
    const v: Record<string, string> = {};
    cells(line, sep).forEach((c, j) => {
      if (header[j]) v[header[j]!] = c;
    });
    const capacity = Number(v.capacity);
    const type = TYPES[plain(v.type ?? "") || "room"];
    const price = amount(v.price ?? "");
    const weekend = amount(v.weekend_price ?? "");
    if (!v.property || !v.name || !v.rate) {
      problems.push(`Fila ${row}: faltan el establecimiento, la habitación o la tarifa`);
      return;
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 12)
      problems.push(`Fila ${row}: la capacidad tiene que ser un número entero de 1 a 12`);
    if (!type)
      problems.push(`Fila ${row}: tipo «${v.type}» desconocido (habitación, suite o familiar)`);
    if (price === undefined || !(price > 0)) problems.push(`Fila ${row}: precio no válido`);
    if (weekend !== undefined && !(weekend > 0))
      problems.push(`Fila ${row}: precio de fin de semana no válido`);
    const known = rates.get(v.rate);
    if (
      known &&
      price !== undefined &&
      price > 0 &&
      (known.price !== price || known.weekend_price !== weekend)
    )
      problems.push(`Fila ${row}: la tarifa «${v.rate}» tiene otro precio en una fila anterior`);
    if (!known && price !== undefined && price > 0)
      rates.set(v.rate, { name: v.rate, price, ...(weekend ? { weekend_price: weekend } : {}) });
    rooms.push({
      property: v.property,
      name: v.name,
      capacity,
      type: type ?? "room",
      rate: v.rate,
      features: (v.features ?? "")
        .split(/[,|]/)
        .map((f) => f.trim())
        .filter(Boolean),
    });
  });
  return { rooms, rates: [...rates.values()], problems };
}
