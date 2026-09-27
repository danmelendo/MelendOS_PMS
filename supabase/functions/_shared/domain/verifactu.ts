// VERI*FACTU pieces shared by the server and the panel: formats of the AEAT
// records and the tax QR of every invoice. Sources (AEAT, sede electrónica →
// desarrolladores → Sistemas Informáticos de Facturación y VERI*FACTU):
// - "Detalle de las especificaciones técnicas para generación de la huella o
//   hash de los registros de facturación" v0.1.2;
// - "Características del QR y especificaciones del servicio de cotejo" v0.5.0.

export type VerifactuEnvironment = "simulated" | "pre" | "prod";

/** "dd-mm-yyyy" of a "yyyy-mm-dd" day (dates in AEAT records). */
export function aeatDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}-${m}-${y}`;
}

/**
 * An amount as the AEAT records carry it: dot for decimals, no leading zeros,
 * two decimals ("123.40"). The hash treats "123.4" and "123.40" alike, but the
 * record and its hash always use this same text.
 */
export function aeatAmount(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

const QR_BASE: Record<Exclude<VerifactuEnvironment, "simulated">, string> = {
  pre: "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR",
  prod: "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR",
};

/**
 * URL of the tax QR ("QR tributario") for an invoice of a VERI*FACTU system:
 * issuer's NIF, series + number, issue date and total, URL-encoded (UTF-8).
 * The simulated environment points at the AEAT test service.
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

/** Legend under the QR for invoices of a VERI*FACTU system (order, art. 20). */
export const VERIFACTU_LEGEND = "VERI*FACTU";
export const QR_CAPTION = "QR tributario:";
