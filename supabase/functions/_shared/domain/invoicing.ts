// Invoices of a stay (Spanish VAT, VERI*FACTU). What is billed, at which VAT
// rate, and how the totals are split per rate. Prices in the PMS include VAT
// (the guest sees final prices), so each rate's base is taken out of the gross
// amount. SQL mirror: public.invoice_vat_rate() and public.invoice_breakdown()
// (parity test in rls.test.ts). References: RD 1619/2012 (facturación) and the
// AEAT's VERI*FACTU record design (TipoFactura, Desglose).
import { validNie, validNif } from "./ses.ts";

/** What a line is, for its VAT rate. */
export type LineKind =
  | "accommodation"
  // extras of the booking (extra_category)
  | "breakfast"
  | "parking"
  | "wellness"
  | "experiences"
  | "services"
  // charges during the stay (folio_charges.category)
  | "food"
  | "catering"
  | "minibar"
  | "laundry"
  | "spa"
  | "other";

/**
 * Default VAT per kind: accommodation and food 10 %, the rest 21 %.
 * A hotel can change any of them (tenants.settings.fiscal.vat_rates),
 * following its tax adviser.
 */
export const DEFAULT_VAT: Record<LineKind, number> = {
  accommodation: 10,
  breakfast: 10,
  food: 10,
  catering: 10,
  minibar: 10,
  parking: 21,
  wellness: 21,
  experiences: 21,
  services: 21,
  laundry: 21,
  spa: 21,
  other: 21,
};

export function vatRate(
  kind: LineKind,
  overrides?: Partial<Record<string, number>> | null,
): number {
  const v = overrides?.[kind];
  return typeof v === "number" && v >= 0 && v <= 100 ? v : DEFAULT_VAT[kind];
}

export interface InvoiceLine {
  kind: LineKind;
  description: string;
  qty: number;
  /** Price per unit, VAT included. */
  unit_price: number;
  vat_rate: number;
}

export interface TaxRow {
  rate: number;
  base: number;
  tax: number;
}

/** Rounds half away from zero, like Postgres' round() on numeric. */
const roundAway = (x: number) => Math.sign(x) * Math.floor(Math.abs(x) + 0.5 + 1e-9);
const cents = (n: number) => roundAway(n * 100);
const eur = (c: number) => c / 100;

/** Gross (VAT included) amount of a line, rounded to cents. */
export const lineTotal = (l: Pick<InvoiceLine, "qty" | "unit_price">) =>
  eur(cents(l.qty * l.unit_price));

/**
 * VAT split per rate: the gross of each rate is added up first, then its base
 * is rounded once (base = gross / (1 + rate)), and the tax is the difference,
 * so base + tax always equals what the guest pays.
 */
export function taxBreakdown(lines: Pick<InvoiceLine, "qty" | "unit_price" | "vat_rate">[]): {
  rows: TaxRow[];
  base: number;
  tax: number;
  total: number;
} {
  const gross = new Map<number, number>();
  for (const l of lines)
    gross.set(l.vat_rate, (gross.get(l.vat_rate) ?? 0) + cents(l.qty * l.unit_price));
  const rows = [...gross.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rate, g]) => {
      const base = roundAway(g / (1 + rate / 100));
      return { rate, base: eur(base), tax: eur(g - base) };
    });
  const base = rows.reduce((s, r) => s + cents(r.base), 0);
  const tax = rows.reduce((s, r) => s + cents(r.tax), 0);
  return { rows, base: eur(base), tax: eur(tax), total: eur(base + tax) };
}

// ── Kinds of invoice (AEAT list L2) ─────────────────────────────────────────

export const INVOICE_TYPES = {
  F1: "Factura",
  F2: "Factura simplificada",
  F3: "Factura en sustitución de simplificadas",
  R1: "Factura rectificativa",
  R5: "Factura rectificativa de simplificada",
} as const;
export type InvoiceType = keyof typeof INVOICE_TYPES;

/** Series of each type: one counter per series and year ("F2026-000001"). */
export const SERIES_PREFIX: Record<InvoiceType, string> = {
  F1: "F",
  F2: "S",
  F3: "F",
  R1: "R",
  R5: "RS",
};

export function invoiceNumber(prefix: string, year: number, n: number): string {
  return `${prefix}${year}-${String(n).padStart(6, "0")}`;
}

// ── Recipient ───────────────────────────────────────────────────────────────

/** Spanish company tax id (CIF): letter, 7 digits and a control character. */
export function validCif(value: string): boolean {
  const v = value.toUpperCase().replace(/[\s-]/g, "");
  const m = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(v);
  if (!m) return false;
  const digits = m[2].split("").map(Number);
  let sum = 0;
  digits.forEach((d, i) => {
    if (i % 2 === 0) {
      const x = d * 2;
      sum += Math.floor(x / 10) + (x % 10);
    } else sum += d;
  });
  const control = (10 - (sum % 10)) % 10;
  const letter = "JABCDEFGHI"[control];
  const c = m[3];
  // Some kinds of entity use a letter, others a digit; accept the right one of either.
  if ("PQRSNW".includes(m[1])) return c === letter;
  if ("ABEH".includes(m[1])) return c === String(control);
  return c === String(control) || c === letter;
}

/** Any Spanish tax id: DNI/NIF, NIE or CIF. */
export function validSpanishTaxId(value: string): boolean {
  return validNif(value) || validNie(value) || validCif(value);
}

export interface Recipient {
  name: string;
  /** Spanish tax id (NIF/NIE/CIF)… */
  nif?: string | null;
  /** …or a foreign one: ISO 3166-1 alpha-2 country, AEAT id type and number. */
  country?: string | null;
  id_type?: "02" | "03" | "04" | "05" | "06" | "07" | null;
  id_number?: string | null;
  address?: string | null;
}

export const FOREIGN_ID_TYPES = {
  "02": "NIF-IVA (UE)",
  "03": "Pasaporte",
  "04": "Documento oficial del país de residencia",
  "05": "Certificado de residencia",
  "06": "Otro documento",
} as const;

/** Why a recipient cannot go on a full invoice (empty if it can). */
export function recipientIssues(r: Recipient | null | undefined): string[] {
  const out: string[] = [];
  if (!r || !r.name?.trim()) out.push("Falta el nombre o la razón social");
  if (r?.name && r.name.trim().length > 120) out.push("Nombre de más de 120 caracteres");
  const nif = r?.nif?.trim();
  if (nif) {
    if (!validSpanishTaxId(nif)) out.push("El NIF no es válido");
  } else {
    if (!r?.country || !/^[A-Z]{2}$/.test(r.country) || r.country === "ES")
      out.push("Falta el NIF (o, si es extranjero, el país)");
    if (!r?.id_type) out.push("Falta el tipo de documento extranjero");
    if (!r?.id_number?.trim()) out.push("Falta el número de documento");
    else if (r.id_number.trim().length > 20) out.push("Documento de más de 20 caracteres");
  }
  return out;
}

/**
 * Whether a simplified invoice (no recipient) is allowed for this amount. The
 * general limit is 400 € (RD 1619/2012, art. 4.1); some activities may go up to
 * 3.000 €, which each hotel sets with its adviser (settings.fiscal.simplified_limit).
 */
export function simplifiedAllowed(total: number, limit = 400): boolean {
  return Math.abs(total) <= limit;
}
