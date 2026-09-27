// Spanish traveller register (SES.HOSPEDAJES, Real Decreto 933/2021): what a
// hotel must report to the Ministry of the Interior within 24 hours.
// - RH (reserva de hospedaje): every booking, when it is made or cancelled.
// - PV (parte de viajeros): every guest who stays, at check-in.
// Codes and rules from the ministry's "Servicio de Comunicación" v3.1.2 and its
// code tables ("Instrucciones para el alta masiva", 8.3 to 8.7). The same
// rules run in the guest and panel forms and on the server before sending;
// the ministry validates again and its answer is what counts.
// SQL mirror of the required fields: public.ses_traveller_missing().
import { isAlpha3 } from "./countries.ts";

export const SES_DEADLINE_HOURS = 24;

export const DOCUMENT_TYPES = {
  NIF: "DNI / NIF",
  NIE: "NIE",
  PAS: "Pasaporte",
  OTRO: "Otro documento",
} as const;
export type DocumentType = keyof typeof DOCUMENT_TYPES;

export const SEXES = { H: "Hombre", M: "Mujer", O: "Otro" } as const;
export type Sex = keyof typeof SEXES;

/** Relation of a minor with an adult of the party (TIPO_PARENTESCO). */
export const KINSHIPS = {
  PM: "Padre o madre",
  TU: "Tutor/a",
  AB: "Abuelo/a",
  BA: "Bisabuelo/a",
  HR: "Hermano/a",
  TI: "Tío/a",
  CD: "Cuñado/a",
  SG: "Suegro/a",
  CY: "Cónyuge",
  HJ: "Hijo/a",
  NI: "Nieto/a",
  BN: "Bisnieto/a",
  SB: "Sobrino/a",
  YN: "Yerno o nuera",
  OT: "Otro",
} as const;
export type Kinship = keyof typeof KINSHIPS;

export const PAYMENT_TYPES = {
  EFECT: "Efectivo",
  TARJT: "Tarjeta de crédito",
  PLATF: "Plataforma de pago",
  TRANS: "Transferencia",
  MOVIL: "Pago por móvil",
  TREG: "Tarjeta regalo",
  DESTI: "Pago en destino",
  OTRO: "Otros medios de pago",
} as const;
export type PaymentType = keyof typeof PAYMENT_TYPES;

export const ESTABLISHMENT_TYPES = {
  HOTEL: "Hotel",
  H_RURAL: "Hotel rural",
  HOSTAL: "Hostal",
  APARTHOTEL: "Apartahotel",
  APART: "Apartamento",
  PENSION: "Pensión",
  ALBERGUE: "Albergue",
  CASA_RURAL: "Casa rural",
  PARADOR: "Parador de turismo",
  OTROS: "Otro",
} as const;

/** A person staying (or holding the booking), as stored in stay_travellers. */
export interface SesTraveller {
  is_holder?: boolean;
  first_name: string | null;
  last_name1: string | null;
  last_name2?: string | null;
  document_type?: string | null;
  document_number?: string | null;
  document_support?: string | null;
  birth_date?: string | null; // yyyy-MM-dd
  nationality?: string | null; // ISO 3166-1 alpha-3
  sex?: string | null;
  address?: string | null;
  address_extra?: string | null;
  municipality_code?: string | null; // INE, 5 digits (Spain)
  municipality_name?: string | null; // abroad
  postal_code?: string | null;
  country?: string | null; // alpha-3
  phone?: string | null;
  phone2?: string | null;
  email?: string | null;
  kinship?: string | null;
}

export type TravellerField = keyof SesTraveller;
export interface Issue {
  field: TravellerField | "party";
  message: string;
}

const blank = (v: string | null | undefined) => !v || !v.trim();
const tooLong = (v: string | null | undefined, n: number) => !!v && v.trim().length > n;

/** Full years between a birth date and a day (both yyyy-MM-dd). */
export function ageOn(birth: string, day: string): number {
  const [by, bm, bd] = birth.split("-").map(Number);
  const [y, m, d] = day.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

/** Spanish DNI/NIF (8 digits + control letter). */
export function validNif(value: string): boolean {
  const v = value.toUpperCase().replace(/[\s-]/g, "");
  const m = /^(\d{8})([A-Z])$/.exec(v);
  return !!m && DNI_LETTERS[Number(m[1]) % 23] === m[2];
}

/** Foreigner id (X/Y/Z + 7 digits + control letter). */
export function validNie(value: string): boolean {
  const v = value.toUpperCase().replace(/[\s-]/g, "");
  const m = /^([XYZ])(\d{7})([A-Z])$/.exec(v);
  return !!m && DNI_LETTERS[Number("XYZ".indexOf(m[1]) + m[2]) % 23] === m[3];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * What a traveller report (PV) needs from one person, on the check-in day.
 * Adults: identity document; NIF: second surname; NIF/NIE: support number;
 * everyone: birth date, home address and a phone or email; minors: their
 * relation with an adult of the party.
 */
export function travellerIssues(t: SesTraveller, checkIn: string): Issue[] {
  const out: Issue[] = [];
  const add = (field: TravellerField, message: string) => out.push({ field, message });

  if (blank(t.first_name)) add("first_name", "Falta el nombre");
  if (blank(t.last_name1)) add("last_name1", "Falta el primer apellido");
  if (tooLong(t.first_name, 50) || tooLong(t.last_name1, 50) || tooLong(t.last_name2, 50))
    add("first_name", "Nombre o apellidos de más de 50 caracteres");

  let adult = true;
  if (blank(t.birth_date)) add("birth_date", "Falta la fecha de nacimiento");
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(t.birth_date!) || t.birth_date! > checkIn)
    add("birth_date", "Fecha de nacimiento no válida");
  else adult = ageOn(t.birth_date!, checkIn) >= 18;

  const type = t.document_type ?? null;
  const number = (t.document_number ?? "").trim();
  if (type && !(type in DOCUMENT_TYPES)) add("document_type", "Tipo de documento no válido");
  if (adult && !type) add("document_type", "Falta el tipo de documento");
  if (adult && !number) add("document_number", "Falta el número de documento");
  if (number && !type) add("document_type", "Falta el tipo de documento");
  if (number.length > 15) add("document_number", "Número de documento de más de 15 caracteres");
  if (type === "NIF" && number && !validNif(number))
    add("document_number", "El DNI no es válido (revisa la letra)");
  if (type === "NIE" && number && !validNie(number))
    add("document_number", "El NIE no es válido (revisa la letra)");
  if (type === "NIF" && blank(t.last_name2))
    add("last_name2", "Con DNI hace falta el segundo apellido");
  if ((type === "NIF" || type === "NIE") && number) {
    if (blank(t.document_support)) add("document_support", "Falta el número de soporte");
    else if (tooLong(t.document_support, 9))
      add("document_support", "El número de soporte tiene como máximo 9 caracteres");
  }

  if (t.nationality && !isAlpha3(t.nationality)) add("nationality", "Nacionalidad no válida");
  if (t.sex && !(t.sex in SEXES)) add("sex", "Sexo no válido");

  if (blank(t.address)) add("address", "Falta la dirección");
  else if (tooLong(t.address, 100)) add("address", "Dirección de más de 100 caracteres");
  if (blank(t.postal_code)) add("postal_code", "Falta el código postal");
  if (blank(t.country)) add("country", "Falta el país de residencia");
  else if (!isAlpha3(t.country)) add("country", "País no válido");
  else if (t.country === "ESP") {
    if (!/^\d{5}$/.test(t.municipality_code ?? ""))
      add("municipality_code", "Falta el código de municipio del INE (5 cifras)");
  } else if (blank(t.municipality_name)) add("municipality_name", "Falta la ciudad");

  if (blank(t.phone) && blank(t.phone2) && blank(t.email))
    add("phone", "Hace falta un teléfono o un email");
  if (!blank(t.email) && (!EMAIL.test(t.email!.trim()) || tooLong(t.email, 250)))
    add("email", "Email no válido");
  if (tooLong(t.phone, 20) || tooLong(t.phone2, 20)) add("phone", "Teléfono demasiado largo");

  if (!adult && !t.kinship) add("kinship", "Falta el parentesco del menor con un adulto");
  if (t.kinship && !(t.kinship in KINSHIPS)) add("kinship", "Parentesco no válido");
  return out;
}

/** The whole party at check-in: every guest registered, minors with an adult. */
export function partyIssues(
  travellers: SesTraveller[],
  checkIn: string,
  people: number,
): { travellers: Issue[][]; party: Issue[] } {
  const each = travellers.map((t) => travellerIssues(t, checkIn));
  const party: Issue[] = [];
  if (travellers.length < people)
    party.push({
      field: "party",
      message: `Faltan ${people - travellers.length} de ${people} viajeros por registrar`,
    });
  const known = travellers.filter((t) => t.birth_date && /^\d{4}-\d{2}-\d{2}$/.test(t.birth_date));
  const minors = known.filter((t) => ageOn(t.birth_date!, checkIn) < 18);
  if (minors.length && minors.length === travellers.length)
    party.push({ field: "party", message: "Un menor tiene que alojarse con un adulto" });
  return { travellers: each, party };
}

/** The booking holder for RH: name and a way to reach them are enough. */
export function holderIssues(t: SesTraveller): Issue[] {
  const out: Issue[] = [];
  if (blank(t.first_name))
    out.push({ field: "first_name", message: "Falta el nombre del titular" });
  if (blank(t.last_name1))
    out.push({ field: "last_name1", message: "Falta el apellido del titular" });
  if (blank(t.phone) && blank(t.phone2) && blank(t.email))
    out.push({ field: "phone", message: "El titular necesita un teléfono o un email" });
  return out;
}

/**
 * "Nombre Apellido1 Apellido2" of a booking made with a single name field.
 * The first word is the name and the rest the surnames, the usual order in
 * Spanish; the guest or reception can always correct it in the register.
 */
export function splitFullName(full: string | null | undefined): {
  first_name: string | null;
  last_name1: string | null;
  last_name2: string | null;
} {
  const words = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return { first_name: words[0] ?? null, last_name1: null, last_name2: null };
  return {
    first_name: words[0],
    last_name1: words[1],
    last_name2: words.length > 2 ? words.slice(2).join(" ") : null,
  };
}

/** How the booking is paid, in the ministry's codes. */
export function sesPaymentType(b: {
  payment_mode: string;
  channel_id?: string | null;
}): PaymentType {
  if (b.channel_id) return "PLATF"; // paid through the OTA or tour operator
  return b.payment_mode === "prepay" ? "PLATF" : "DESTI";
}

/** Masked document number for staff lists: only the last 3 characters. */
export function maskDocument(n: string | null | undefined): string | null {
  if (!n) return null;
  const v = n.trim();
  return v.length <= 3 ? "•••" : "•".repeat(Math.min(6, v.length - 3)) + v.slice(-3);
}
