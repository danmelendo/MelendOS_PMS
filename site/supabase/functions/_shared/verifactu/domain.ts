// Copied from the product (supabase/functions/_shared/domain/verifactu.ts and
// the tax id checks of domain/ses.ts and domain/invoicing.ts). Keep in step:
// a fix there goes here too (see site/README.md, VERI*FACTU).

export type VerifactuEnvironment = "simulated" | "pre" | "prod";

/** "dd-mm-yyyy" of a "yyyy-mm-dd" day (dates in AEAT records). */
export function aeatDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}-${m}-${y}`;
}

/** An amount as the AEAT records carry it: dot for decimals, two decimals ("123.40"). */
export function aeatAmount(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

const QR_BASE: Record<Exclude<VerifactuEnvironment, "simulated">, string> = {
  pre: "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR",
  prod: "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR",
};

/**
 * URL of the tax QR ("QR tributario"): issuer's NIF, series + number, issue
 * date and total. The simulated environment points at the AEAT test service.
 */
export function qrUrl(p: {
  environment: VerifactuEnvironment;
  nif: string;
  number: string;
  issueDate: string; // yyyy-mm-dd
  total: number;
}): string {
  const base = QR_BASE[p.environment === "prod" ? "prod" : "pre"];
  const q = [
    ["nif", p.nif],
    ["numserie", p.number],
    ["fecha", aeatDate(p.issueDate)],
    ["importe", aeatAmount(p.total)],
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `${base}?${q}`;
}

/** Legend next to the QR of a VERI*FACTU invoice (Orden HAC/1177/2024, art. 20). */
export const VERIFACTU_LEGEND = "Factura verificable en la sede electrónica de la AEAT";

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

/** Spanish DNI/NIF of a person: 8 digits and its control letter. */
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
  if ("PQRSNW".includes(m[1])) return c === letter;
  if ("ABEH".includes(m[1])) return c === String(control);
  return c === String(control) || c === letter;
}

/** Any Spanish tax id: DNI/NIF, NIE or CIF. */
export function validSpanishTaxId(value: string): boolean {
  return validNif(value) || validNie(value) || validCif(value);
}
