// XML of the ministry's "Servicio de Comunicación" (SES.HOSPEDAJES v3.1.2):
// the request files (traveller reports, bookings, batch queries and
// cancellations), the SOAP envelope that carries them and the parser of its
// answers. Element order follows the ministry's XSD sequences; optional
// elements are left out when empty.

export const SES_ENDPOINTS = {
  pre: "https://hospedajes.pre-ses.mir.es/hospedajes-web/ws/v1/comunicacion",
  prod: "https://hospedajes.ses.mir.es/hospedajes-web/ws/v1/comunicacion",
} as const;

const NS = {
  soap: "http://schemas.xmlsoap.org/soap/envelope/",
  com: "http://www.soap.servicios.hospedajes.mir.es/comunicacion",
  PV: "http://www.neg.hospedajes.mir.es/altaParteHospedaje",
  RH: "http://www.neg.hospedajes.mir.es/altaReservaHospedaje",
  query: "http://www.neg.hospedajes.mir.es/consultarComunicacion",
  cancel: "http://www.neg.hospedajes.mir.es/anularComunicacion",
};

export type SesKind = "PV" | "RH";
export type SesOperation = "A" | "B" | "C";

export interface SesAddress {
  direccion: string;
  direccionComplementaria?: string | null;
  codigoMunicipio?: string | null;
  nombreMunicipio?: string | null;
  codigoPostal: string;
  pais: string;
}

export interface SesPerson {
  rol: "VI" | "TI";
  nombre: string;
  apellido1: string;
  apellido2?: string | null;
  tipoDocumento?: string | null;
  numeroDocumento?: string | null;
  soporteDocumento?: string | null; // PV only
  fechaNacimiento?: string | null;
  nacionalidad?: string | null;
  sexo?: string | null;
  direccion?: SesAddress | null;
  telefono?: string | null;
  telefono2?: string | null;
  correo?: string | null;
  parentesco?: string | null; // PV only
}

export interface SesContract {
  referencia: string;
  fechaContrato: string; // yyyy-MM-dd
  fechaEntrada: string; // yyyy-MM-ddThh:mm:ss (hotel time)
  fechaSalida: string;
  numPersonas: number;
  numHabitaciones?: number | null;
  internet?: boolean | null;
  pago: { tipoPago: string; fechaPago?: string | null; titular?: string | null };
}

export interface SesCommunication {
  establecimiento: string; // establishment code
  contrato: SesContract;
  personas: SesPerson[];
}

const esc = (v: string) =>
  v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** <tag>value</tag>, or nothing when the value is empty. */
function el(tag: string, value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return `<${tag}>${esc(String(value).trim())}</${tag}>`;
}

function address(a: SesAddress | null | undefined): string {
  if (!a) return "";
  return (
    "<direccion>" +
    el("direccion", a.direccion) +
    el("direccionComplementaria", a.direccionComplementaria) +
    el("codigoMunicipio", a.pais === "ESP" ? a.codigoMunicipio : null) +
    el("nombreMunicipio", a.pais === "ESP" ? null : a.nombreMunicipio) +
    el("codigoPostal", a.codigoPostal) +
    el("pais", a.pais) +
    "</direccion>"
  );
}

function contract(c: SesContract): string {
  return (
    "<contrato>" +
    el("referencia", c.referencia) +
    el("fechaContrato", c.fechaContrato) +
    el("fechaEntrada", c.fechaEntrada) +
    el("fechaSalida", c.fechaSalida) +
    el("numPersonas", c.numPersonas) +
    el("numHabitaciones", c.numHabitaciones) +
    el("internet", c.internet) +
    "<pago>" +
    el("tipoPago", c.pago.tipoPago) +
    el("fechaPago", c.pago.fechaPago) +
    el("titular", c.pago.titular) +
    "</pago>" +
    "</contrato>"
  );
}

function person(p: SesPerson, kind: SesKind): string {
  return (
    "<persona>" +
    el("rol", p.rol) +
    el("nombre", p.nombre) +
    el("apellido1", p.apellido1) +
    el("apellido2", p.apellido2) +
    el("tipoDocumento", p.tipoDocumento) +
    el("numeroDocumento", p.numeroDocumento) +
    (kind === "PV" ? el("soporteDocumento", p.soporteDocumento) : "") +
    el("fechaNacimiento", p.fechaNacimiento) +
    el("nacionalidad", p.nacionalidad) +
    el("sexo", p.sexo) +
    address(p.direccion) +
    el("telefono", p.telefono) +
    el("telefono2", p.telefono2) +
    el("correo", p.correo) +
    (kind === "PV" ? el("parentesco", p.parentesco) : "") +
    "</persona>"
  );
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>';

/**
 * Request file of a batch of new communications of one kind. Traveller
 * reports (PV) share one establishment per file; bookings (RH) name it in each
 * communication.
 */
export function buildAltaXml(kind: SesKind, comms: SesCommunication[]): string {
  if (!comms.length) throw new Error("Lote vacío");
  if (kind === "PV") {
    const codes = new Set(comms.map((c) => c.establecimiento));
    if (codes.size > 1) throw new Error("Un lote de partes es de un solo establecimiento");
    return (
      XML_DECL +
      `<alt:peticion xmlns:alt="${NS.PV}"><solicitud>` +
      el("codigoEstablecimiento", comms[0].establecimiento) +
      comms
        .map(
          (c) =>
            "<comunicacion>" +
            contract(c.contrato) +
            c.personas.map((p) => person(p, "PV")).join("") +
            "</comunicacion>",
        )
        .join("") +
      "</solicitud></alt:peticion>"
    );
  }
  return (
    XML_DECL +
    `<alt:peticion xmlns:alt="${NS.RH}"><solicitud>` +
    comms
      .map(
        (c) =>
          "<comunicacion>" +
          "<establecimiento>" +
          el("codigo", c.establecimiento) +
          "</establecimiento>" +
          contract(c.contrato) +
          c.personas.map((p) => person(p, "RH")).join("") +
          "</comunicacion>",
      )
      .join("") +
    "</solicitud></alt:peticion>"
  );
}

/** Request file to ask how some batches went (at most 10). */
export function buildQueryXml(batches: string[]): string {
  return (
    XML_DECL +
    `<con:lotes xmlns:con="${NS.query}">` +
    batches.map((b) => `<con:lote>${esc(b)}</con:lote>`).join("") +
    "</con:lotes>"
  );
}

/** Request file to cancel communications by their ministry codes. */
export function buildCancelXml(codes: string[]): string {
  return (
    XML_DECL +
    `<anul:comunicaciones xmlns:anul="${NS.cancel}">` +
    codes.map((c) => `<anul:codigoComunicacion>${esc(c)}</anul:codigoComunicacion>`).join("") +
    "</anul:comunicaciones>"
  );
}

/** SOAP envelope of the "comunicacion" operation; `solicitud` is zip+base64. */
export function soapEnvelope(h: {
  arrendador: string;
  aplicacion: string;
  operacion: SesOperation;
  tipo?: SesKind;
  solicitud: string;
}): string {
  return (
    XML_DECL +
    `<soapenv:Envelope xmlns:soapenv="${NS.soap}" xmlns:com="${NS.com}">` +
    "<soapenv:Header/><soapenv:Body><com:comunicacionRequest><peticion><cabecera>" +
    el("codigoArrendador", h.arrendador) +
    el("aplicacion", h.aplicacion.slice(0, 50)) +
    el("tipoOperacion", h.operacion) +
    (h.operacion === "A" ? el("tipoComunicacion", h.tipo) : "") +
    "</cabecera>" +
    `<solicitud>${h.solicitud}</solicitud>` +
    "</peticion></com:comunicacionRequest></soapenv:Body></soapenv:Envelope>"
  );
}

// ── Answers ─────────────────────────────────────────────────────────────────
// Small tag reader (Edge Functions have no DOM). Tags may carry a namespace
// prefix; the examples of the specification spell some names two ways
// (codigo/codigoRetorno, resultadoComunicacion/resutadoComunicacion), so both
// are accepted.

const unesc = (v: string) =>
  v
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

function blocks(xml: string, ...names: string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    const re = new RegExp(
      `<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`,
      "g",
    );
    for (const m of xml.matchAll(re)) out.push(m[1]);
  }
  return out;
}
const text = (xml: string, ...names: string[]) => {
  const b = blocks(xml, ...names)[0];
  return b === undefined ? null : unesc(b.trim());
};

export interface SesCommunicationResult {
  orden: number;
  codigo: string | null;
  anulada: boolean;
  tipoError: string | null;
  error: string | null;
}
export interface SesBatchResult {
  lote: string;
  tipoOperacion: string | null;
  /** 1 ok, 2 header/format errors, 3 unexpected, 4 in process, 5 pending, 6 some failed. */
  codigoEstado: number;
  descEstado: string | null;
  comunicaciones: SesCommunicationResult[];
}
export interface SesResponse {
  codigo: number;
  descripcion: string;
  lote: string | null;
  resultados: SesBatchResult[];
}

export function parseResponse(xml: string): SesResponse {
  const fault = text(xml, "faultstring");
  if (fault !== null) return { codigo: -1, descripcion: fault, lote: null, resultados: [] };
  const head = blocks(xml, "respuesta")[0];
  if (head === undefined) throw new Error("Respuesta sin bloque «respuesta»");
  const codigo = Number(text(head, "codigoRetorno", "codigo"));
  const resultados = blocks(xml, "resultado").map((r) => ({
    lote: text(r, "lote") ?? "",
    tipoOperacion: text(r, "tipoOperacion"),
    codigoEstado: Number(text(r, "codigoEstado") ?? 0),
    descEstado: text(r, "descEstado"),
    comunicaciones: blocks(r, "resultadoComunicacion", "resutadoComunicacion")
      .map((c) => ({
        orden: Number(text(c, "orden") ?? 0),
        codigo: text(c, "codigoComunicacion"),
        anulada: text(c, "anulada") === "true",
        tipoError: text(c, "tipoError"),
        error: text(c, "error"),
      }))
      .sort((a, b) => a.orden - b.orden),
  }));
  return {
    codigo: Number.isFinite(codigo) ? codigo : -1,
    descripcion: text(head, "descripcion") ?? "",
    lote: text(head, "lote"),
    resultados,
  };
}

/** "yyyy-MM-ddThh:mm:ss" of an instant in a timezone (the hotel's). */
export function localDateTime(instant: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const p = (t: string) => parts.find((x) => x.type === t)!.value;
  return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}:${p("second")}`;
}
