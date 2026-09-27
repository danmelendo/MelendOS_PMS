// XML of the AEAT's VERI*FACTU web service (SistemaFacturacion.wsdl,
// SuministroLR.xsd / SuministroInformacion.xsd v1.0, "Descripción del servicio
// web" v1.0.3): the RegFactuSistemaFacturacion request with alta and anulación
// records, and the reader of its answer. Element order follows the XSD
// sequences; optional elements are left out when empty.

export const VERIFACTU_ENDPOINTS = {
  pre: "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
  prod: "https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
} as const;

const NS = {
  soap: "http://schemas.xmlsoap.org/soap/envelope/",
  lr: "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd",
  inf: "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd",
};

/** The invoicing system (SIF) as it identifies itself in every record. */
export interface SistemaInformatico {
  producerName: string;
  producerNif: string;
  name: string; // NombreSistemaInformatico (≤ 30)
  id: string; // IdSistemaInformatico (2)
  version: string;
  installation: string; // NumeroInstalacion, one per hotel's invoicing
}

export interface InvoiceRef {
  nif: string;
  number: string;
  date: string; // dd-mm-yyyy
}

export interface RecipientXml {
  name: string;
  nif?: string | null;
  country?: string | null;
  id_type?: string | null;
  id_number?: string | null;
}

/** A billing record with what its XML needs (from verifactu_records + tax_invoices). */
export interface RecordXml {
  id: string; // goes as RefExterna, to match the answer
  kind: "alta" | "anulacion";
  subsanacion: boolean;
  rechazo_previo: "X" | null;
  sin_registro_previo: boolean;
  issuer: { nif: string; name: string };
  invoice: InvoiceRef;
  // alta only
  type?: string;
  description?: string;
  recipient?: RecipientXml | null;
  rectified?: InvoiceRef[];
  replaced?: InvoiceRef[];
  breakdown?: { rate: number; base: string; tax: string }[];
  cuota_total?: string;
  importe_total?: string;
  // chain
  previous: (InvoiceRef & { hash: string }) | null;
  generated_at: string;
  hash: string;
}

const esc = (v: string) =>
  v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** <sf:tag>value</sf:tag>, or nothing when the value is empty. */
function el(tag: string, value: string | number | null | undefined, prefix = "sf"): string {
  if (value === null || value === undefined || value === "") return "";
  return `<${prefix}:${tag}>${esc(String(value).trim())}</${prefix}:${tag}>`;
}
const block = (tag: string, inner: string) => (inner ? `<sf:${tag}>${inner}</sf:${tag}>` : "");

const idFactura = (r: InvoiceRef) =>
  el("IDEmisorFactura", r.nif) +
  el("NumSerieFactura", r.number) +
  el("FechaExpedicionFactura", r.date);

function recipient(r: RecipientXml): string {
  const id = r.nif
    ? el("NIF", r.nif)
    : block(
        "IDOtro",
        el("CodigoPais", r.country) + el("IDType", r.id_type) + el("ID", r.id_number),
      );
  return block("IDDestinatario", el("NombreRazon", r.name) + id);
}

function chain(prev: RecordXml["previous"]): string {
  return block(
    "Encadenamiento",
    prev
      ? block("RegistroAnterior", idFactura(prev) + el("Huella", prev.hash))
      : el("PrimerRegistro", "S"),
  );
}

function sif(s: SistemaInformatico): string {
  return block(
    "SistemaInformatico",
    el("NombreRazon", s.producerName) +
      el("NIF", s.producerNif) +
      el("NombreSistemaInformatico", s.name.slice(0, 30)) +
      el("IdSistemaInformatico", s.id) +
      el("Version", s.version) +
      el("NumeroInstalacion", s.installation) +
      // Only VERI*FACTU; one SaaS for many taxpayers; one invoicing per hotel.
      el("TipoUsoPosibleSoloVerifactu", "S") +
      el("TipoUsoPosibleMultiOT", "S") +
      el("IndicadorMultiplesOT", "N"),
  );
}

function alta(r: RecordXml, s: SistemaInformatico): string {
  const isRect = r.type === "R1" || r.type === "R5";
  return block(
    "RegistroAlta",
    el("IDVersion", "1.0") +
      block("IDFactura", idFactura(r.invoice)) +
      el("RefExterna", r.id) +
      el("NombreRazonEmisor", r.issuer.name) +
      (r.subsanacion ? el("Subsanacion", "S") : "") +
      el("RechazoPrevio", r.rechazo_previo) +
      el("TipoFactura", r.type) +
      (isRect ? el("TipoRectificativa", "I") : "") +
      (r.rectified?.length
        ? block(
            "FacturasRectificadas",
            r.rectified.map((x) => block("IDFacturaRectificada", idFactura(x))).join(""),
          )
        : "") +
      (r.replaced?.length
        ? block(
            "FacturasSustituidas",
            r.replaced.map((x) => block("IDFacturaSustituida", idFactura(x))).join(""),
          )
        : "") +
      el("DescripcionOperacion", r.description?.slice(0, 500)) +
      (r.recipient ? block("Destinatarios", recipient(r.recipient)) : "") +
      block(
        "Desglose",
        (r.breakdown ?? [])
          .map((d) =>
            block(
              "DetalleDesglose",
              el("Impuesto", "01") + // IVA
                el("ClaveRegimen", "01") + // régimen general
                el("CalificacionOperacion", "S1") + // sujeta y no exenta
                el("TipoImpositivo", d.rate) +
                el("BaseImponibleOimporteNoSujeto", d.base) +
                el("CuotaRepercutida", d.tax),
            ),
          )
          .join(""),
      ) +
      el("CuotaTotal", r.cuota_total) +
      el("ImporteTotal", r.importe_total) +
      chain(r.previous) +
      sif(s) +
      el("FechaHoraHusoGenRegistro", r.generated_at) +
      el("TipoHuella", "01") +
      el("Huella", r.hash),
  );
}

function anulacion(r: RecordXml, s: SistemaInformatico): string {
  return block(
    "RegistroAnulacion",
    el("IDVersion", "1.0") +
      block(
        "IDFactura",
        el("IDEmisorFacturaAnulada", r.invoice.nif) +
          el("NumSerieFacturaAnulada", r.invoice.number) +
          el("FechaExpedicionFacturaAnulada", r.invoice.date),
      ) +
      el("RefExterna", r.id) +
      (r.sin_registro_previo ? el("SinRegistroPrevio", "S") : "") +
      chain(r.previous) +
      sif(s) +
      el("FechaHoraHusoGenRegistro", r.generated_at) +
      el("TipoHuella", "01") +
      el("Huella", r.hash),
  );
}

/** The whole SOAP request: header with the taxpayer and up to 1.000 records. */
export function buildRequest(
  issuer: { nif: string; name: string },
  records: RecordXml[],
  s: SistemaInformatico,
): string {
  if (!records.length || records.length > 1000)
    throw new Error("Entre 1 y 1.000 registros por envío");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<soapenv:Envelope xmlns:soapenv="${NS.soap}" xmlns:sum="${NS.lr}" xmlns:sf="${NS.inf}">` +
    "<soapenv:Header/><soapenv:Body><sum:RegFactuSistemaFacturacion>" +
    `<sum:Cabecera>${block("ObligadoEmision", el("NombreRazon", issuer.name) + el("NIF", issuer.nif))}</sum:Cabecera>` +
    records
      .map(
        (r) =>
          `<sum:RegistroFactura>${r.kind === "alta" ? alta(r, s) : anulacion(r, s)}</sum:RegistroFactura>`,
      )
      .join("") +
    "</sum:RegFactuSistemaFacturacion></soapenv:Body></soapenv:Envelope>"
  );
}

// ── Answer ──────────────────────────────────────────────────────────────────

const unesc = (v: string) =>
  v
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

export function blocks(xml: string, name: string): string[] {
  const re = new RegExp(
    `<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`,
    "g",
  );
  return [...xml.matchAll(re)].map((m) => m[1]);
}
export const text = (xml: string, name: string) => {
  const b = blocks(xml, name)[0];
  return b === undefined ? null : unesc(b.trim());
};

export type RecordState = "Correcto" | "AceptadoConErrores" | "Incorrecto";

export interface ResponseLine {
  ref: string | null;
  number: string | null;
  operation: string | null;
  state: RecordState;
  code: string | null;
  description: string | null;
  duplicateState: string | null;
}

export interface VerifactuResponse {
  fault: string | null;
  csv: string | null;
  wait: number | null;
  state: string | null; // Correcto | ParcialmenteCorrecto | Incorrecto
  lines: ResponseLine[];
}

export function parseResponse(xml: string): VerifactuResponse {
  const fault = text(xml, "faultstring");
  if (fault !== null) return { fault, csv: null, wait: null, state: null, lines: [] };
  if (!blocks(xml, "RespuestaRegFactuSistemaFacturacion").length)
    throw new Error("Respuesta de la AEAT sin «RespuestaRegFactuSistemaFacturacion»");
  const wait = text(xml, "TiempoEsperaEnvio");
  return {
    fault: null,
    csv: text(xml, "CSV"),
    wait: wait === null ? null : Number(wait),
    state: text(xml, "EstadoEnvio"),
    lines: blocks(xml, "RespuestaLinea").map((l) => {
      // The duplicate's own state and error are nested; read the line's apart.
      const dup = blocks(l, "RegistroDuplicado")[0];
      const own = l.replace(/<(?:[\w-]+:)?RegistroDuplicado[\s\S]*?RegistroDuplicado>/, "");
      return {
        ref: text(own, "RefExterna"),
        number: text(own, "NumSerieFactura"),
        operation: text(own, "TipoOperacion"),
        state: (text(own, "EstadoRegistro") ?? "Incorrecto") as RecordState,
        code: text(own, "CodigoErrorRegistro"),
        description: text(own, "DescripcionErrorRegistro"),
        duplicateState: dup ? text(dup, "EstadoRegistroDuplicado") : null,
      };
    }),
  };
}
