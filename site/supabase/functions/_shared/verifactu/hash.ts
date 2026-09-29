// Copied from the product (supabase/functions/_shared/verifactu/). Keep in step:
// a fix there goes here too (see site/README.md, VERI*FACTU).
// Chained fingerprint ("huella") of the AEAT billing records: SHA-256 of
// "field=value&field=value…" in UTF-8, uppercase hex (AEAT, especificaciones
// de la huella v0.1.2). Values are trimmed; a missing value keeps "field=".
// The database computes the same in public.verifactu_hash() when it creates a
// record (parity test with the AEAT's own examples in both).

export interface AltaHashInput {
  IDEmisorFactura: string;
  NumSerieFactura: string;
  FechaExpedicionFactura: string; // dd-mm-yyyy
  TipoFactura: string;
  CuotaTotal: string;
  ImporteTotal: string;
  Huella: string; // previous record's, "" for the first one
  FechaHoraHusoGenRegistro: string; // 2024-01-01T19:20:30+01:00
}

export interface AnulacionHashInput {
  IDEmisorFacturaAnulada: string;
  NumSerieFacturaAnulada: string;
  FechaExpedicionFacturaAnulada: string;
  Huella: string;
  FechaHoraHusoGenRegistro: string;
}

const ALTA_FIELDS: (keyof AltaHashInput)[] = [
  "IDEmisorFactura",
  "NumSerieFactura",
  "FechaExpedicionFactura",
  "TipoFactura",
  "CuotaTotal",
  "ImporteTotal",
  "Huella",
  "FechaHoraHusoGenRegistro",
];
const ANULACION_FIELDS: (keyof AnulacionHashInput)[] = [
  "IDEmisorFacturaAnulada",
  "NumSerieFacturaAnulada",
  "FechaExpedicionFacturaAnulada",
  "Huella",
  "FechaHoraHusoGenRegistro",
];

export function hashInput(r: AltaHashInput | AnulacionHashInput): string {
  const fields = "TipoFactura" in r ? ALTA_FIELDS : ANULACION_FIELDS;
  return fields
    .map((f) => `${f}=${String((r as unknown as Record<string, string>)[f] ?? "").trim()}`)
    .join("&");
}

export async function huella(r: AltaHashInput | AnulacionHashInput): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hashInput(r)));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}
