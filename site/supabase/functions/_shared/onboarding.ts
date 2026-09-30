// The onboarding form a customer fills in after signing (/alta/?t=…): its
// sections and fields, how its answers are cleaned and what must be there to
// submit it. Pure: the page draws it from here and the onboarding function
// checks with the same rules. What it asks maps to the product's hotel set-up
// file (scripts/hotel.example.json, docs/alta-hotel.md) plus the files we
// adapt by hand (rooms and reservations spreadsheets).

export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "url"
  | "number"
  | "hour"
  | "color"
  | "textarea"
  | "select"
  | "multi"
  | "emails";

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  max?: number;
  min?: number;
  /** Only shown (and required) when another field of the section has this value. */
  when?: { key: string; is: string | string[] };
}

export interface Section {
  id: string;
  title: string;
  intro: string;
  fields: Field[];
}

const YES_NO_UNKNOWN = [
  { value: "yes", label: "Sí" },
  { value: "no", label: "No" },
  { value: "unknown", label: "No lo sé" },
];

export const SECTIONS: Section[] = [
  {
    id: "establishment",
    title: "Tu alojamiento",
    intro: "Lo que verán tus huéspedes en la web de reservas y en los emails.",
    fields: [
      { key: "trade_name", label: "Nombre comercial", type: "text", required: true, max: 80 },
      {
        key: "kind",
        label: "Tipo de alojamiento",
        type: "select",
        required: true,
        options: [
          { value: "hotel", label: "Hotel" },
          { value: "hostal", label: "Hostal o pensión" },
          { value: "apartments", label: "Apartamentos turísticos" },
          { value: "other", label: "Otro" },
        ],
      },
      {
        key: "rooms",
        label: "Número de habitaciones o unidades",
        type: "number",
        required: true,
        min: 1,
        max: 2000,
      },
      { key: "address", label: "Dirección", type: "text", required: true, max: 200 },
      { key: "postal_code", label: "Código postal", type: "text", required: true, max: 10 },
      { key: "city", label: "Localidad", type: "text", required: true, max: 80 },
      { key: "province", label: "Provincia", type: "text", required: true, max: 80 },
      { key: "phone", label: "Teléfono de reservas", type: "tel", required: true, max: 40 },
      {
        key: "email",
        label: "Email de reservas",
        type: "email",
        required: true,
        max: 120,
        help: "Las respuestas de los huéspedes a nuestros emails llegan aquí.",
      },
      { key: "website", label: "Web actual", type: "url", max: 200, placeholder: "https://" },
      { key: "checkin_hour", label: "Entrada desde las", type: "hour", required: true },
      { key: "checkout_hour", label: "Salida hasta las", type: "hour", required: true },
    ],
  },
  {
    id: "fiscal",
    title: "Datos fiscales",
    intro: "Para tus facturas a huéspedes (VERI*FACTU) y para las nuestras.",
    fields: [
      { key: "legal_name", label: "Razón social", type: "text", required: true, max: 160 },
      { key: "tax_id", label: "NIF / CIF", type: "text", required: true, max: 20 },
      { key: "fiscal_address", label: "Domicilio fiscal", type: "text", required: true, max: 200 },
      {
        key: "invoicing",
        label: "¿Vais a emitir las facturas a huéspedes desde Melend/OS?",
        type: "select",
        required: true,
        options: YES_NO_UNKNOWN,
      },
    ],
  },
  {
    id: "web",
    title: "Tu web y tus emails",
    intro:
      "Primero dinos si quieres que te hagamos la web o si ya tienes la tuya: solo te pediremos lo que haga falta.",
    fields: [
      {
        key: "web_mode",
        label: "¿Qué web vas a usar?",
        type: "select",
        required: true,
        options: [
          { value: "template", label: "Quiero la web de Melend/OS (plantilla con reservas)" },
          { value: "own", label: "Ya tengo mi web: solo quiero el botón de reservar" },
        ],
      },
      // Their own web: where the booking button (and the assistant) go.
      {
        key: "own_url",
        label: "Dirección de tu web",
        type: "url",
        required: true,
        max: 200,
        placeholder: "https://www.tuhotel.com",
        help: "Ahí pondremos el botón «Reservar» (y el asistente, si lo has contratado).",
        when: { key: "web_mode", is: "own" },
      },
      {
        key: "own_platform",
        label: "¿Con qué está hecha?",
        type: "select",
        options: [
          { value: "wordpress", label: "WordPress" },
          { value: "wix", label: "Wix" },
          { value: "squarespace", label: "Squarespace" },
          { value: "webflow", label: "Webflow" },
          { value: "custom", label: "A medida" },
          { value: "unknown", label: "No lo sé" },
        ],
        when: { key: "web_mode", is: "own" },
      },
      {
        key: "web_contact",
        label: "¿Quién mantiene tu web?",
        type: "text",
        max: 160,
        placeholder: "Nombre y email o teléfono",
        help: "Le enviaremos el código del botón, o se lo ponemos nosotros si nos das acceso.",
        when: { key: "web_mode", is: "own" },
      },
      // Where the booking pages answer (both cases).
      {
        key: "booking_address",
        label: "¿Dónde quieres las páginas de reserva?",
        type: "select",
        required: true,
        options: [
          { value: "own_domain", label: "En mi dominio, p. ej. reservas.tuhotel.com" },
          { value: "ours", label: "En la dirección que nos deis (tuhotel.melendo.app)" },
        ],
        help: "Es la página que se abre al reservar y donde el huésped gestiona su reserva.",
        when: { key: "web_mode", is: ["template", "own"] },
      },
      {
        key: "domain",
        label: "Dirección que quieres",
        type: "text",
        required: true,
        max: 120,
        placeholder: "reservas.tuhotel.com",
        when: { key: "booking_address", is: "own_domain" },
      },
      {
        key: "dns_manager",
        label: "¿Quién gestiona tu dominio?",
        type: "select",
        options: [
          { value: "me", label: "Yo mismo" },
          { value: "provider", label: "Mi informático o la empresa de mi web" },
          { value: "unknown", label: "No lo sé" },
        ],
        help: "Hay que añadir un registro DNS; te mandamos los pasos.",
        when: { key: "booking_address", is: "own_domain" },
      },
      // Look of the template web and of the emails.
      {
        key: "accent",
        label: "Color principal",
        type: "color",
        help: "Botones y detalles de la web y de los emails.",
        when: { key: "web_mode", is: ["template", "own"] },
      },
      {
        key: "tagline",
        label: "Lema o frase corta de tu web",
        type: "text",
        max: 160,
        placeholder: "Un hotel familiar junto al mar",
        when: { key: "web_mode", is: "template" },
      },
      {
        key: "email_header",
        label: "Cabecera de los emails de reserva",
        type: "select",
        required: true,
        options: [
          { value: "logo", label: "Mi logotipo sobre blanco" },
          { value: "image", label: "Una foto de mi alojamiento" },
          { value: "color", label: "Una banda con mi color y mi nombre" },
        ],
        when: { key: "web_mode", is: ["template", "own"] },
      },
    ],
  },
  {
    id: "policies",
    title: "Reservas, pagos y cancelaciones",
    intro: "Las condiciones que aceptará cada huésped al reservar.",
    fields: [
      {
        key: "payment_modes",
        label: "Formas de pago",
        type: "multi",
        required: true,
        options: [
          { value: "prepay", label: "Pago online al reservar" },
          { value: "at_hotel", label: "Pago en el alojamiento" },
        ],
      },
      {
        key: "free_cancellation_hours",
        label: "Cancelación gratuita hasta (horas antes de la llegada)",
        type: "number",
        required: true,
        min: 0,
        max: 720,
        help: "Por ejemplo 48 = hasta dos días antes. 0 = sin cancelación gratuita.",
      },
      {
        key: "penalty",
        label: "Si cancela más tarde",
        type: "select",
        required: true,
        options: [
          { value: "first_night", label: "Se cobra la primera noche" },
          { value: "full", label: "Se cobra la estancia completa" },
          { value: "none", label: "No se cobra nada" },
        ],
      },
      {
        key: "gateway",
        label: "¿Con qué cobras con tarjeta?",
        type: "select",
        options: [
          { value: "redsys", label: "TPV de mi banco (Redsys)" },
          { value: "stripe", label: "Stripe" },
          { value: "none", label: "Aún no cobro online" },
          { value: "unknown", label: "No lo sé" },
        ],
        help: "Solo el nombre: las claves del TPV las pondrás tú en tu panel, nunca en este formulario.",
      },
      {
        key: "bank",
        label: "Banco del TPV",
        type: "text",
        max: 80,
        when: { key: "gateway", is: "redsys" },
      },
    ],
  },
  {
    id: "team",
    title: "Tu equipo",
    intro: "Cada persona recibirá una invitación para elegir su contraseña.",
    fields: [
      {
        key: "admins",
        label: "Emails de dirección",
        type: "emails",
        required: true,
        help: "Ven todo y configuran. Uno por línea.",
      },
      {
        key: "reception",
        label: "Emails de recepción",
        type: "emails",
        help: "Operativa del día a día. Uno por línea.",
      },
    ],
  },
  {
    id: "compliance",
    title: "Registro de viajeros",
    intro: "Para comunicar las entradas a SES.HOSPEDAJES (Ministerio del Interior).",
    fields: [
      {
        key: "ses_registered",
        label: "¿Estáis dados de alta en SES.HOSPEDAJES?",
        type: "select",
        required: true,
        options: YES_NO_UNKNOWN,
      },
      {
        key: "ses_landlord_code",
        label: "Código de arrendador",
        type: "text",
        max: 40,
        when: { key: "ses_registered", is: "yes" },
      },
      {
        key: "ses_establishment_code",
        label: "Código de establecimiento",
        type: "text",
        max: 40,
        when: { key: "ses_registered", is: "yes" },
      },
    ],
  },
];

export type FileKind = "rooms" | "reservations" | "logo" | "header" | "photos" | "other";

export interface FileKindDef {
  kind: FileKind;
  label: string;
  help: string;
  accept: string[];
  /** Where it is uploaded: in its own step, or next to the web questions. */
  section: "web" | "files";
  /** Shown (and required, if required) only for these answers of the web section. */
  when?: Field["when"];
  required?: boolean;
}

export const FILE_KINDS: FileKindDef[] = [
  {
    kind: "logo",
    label: "Logotipo",
    help: "PNG con fondo transparente, de al menos 480 × 112 px (en el email se ve a 240 × 56). Si tienes una versión clara para fondos oscuros, súbela también.",
    accept: ["png", "jpg", "jpeg", "webp", "pdf"],
    section: "web",
    when: { key: "email_header", is: "logo" },
    required: true,
  },
  {
    kind: "header",
    label: "Foto de cabecera de los emails",
    help: "JPG horizontal de 1200 × 440 px (se ve a 600 × 220), de menos de 1 MB. Sin texto ni detalles importantes cerca de los bordes.",
    accept: ["jpg", "jpeg", "png", "webp"],
    section: "web",
    when: { key: "email_header", is: "image" },
    required: true,
  },
  {
    kind: "photos",
    label: "Fotos para tu web",
    help: "Fachada, recepción, habitaciones… en JPG de al menos 1600 px de ancho. La primera será la portada. Si no tienes logotipo, tu nombre irá en texto.",
    accept: ["jpg", "jpeg", "png", "webp", "zip"],
    section: "web",
    when: { key: "web_mode", is: "template" },
  },
  {
    kind: "rooms",
    label: "Habitaciones y tarifas",
    help: "Tu Excel o CSV con cada habitación, su tipo, capacidad y precio por noche (y de fin de semana, si cambia). En el formato que tengas: lo adaptamos nosotros.",
    accept: ["xlsx", "xls", "ods", "csv", "pdf"],
    section: "files",
    required: true,
  },
  {
    kind: "reservations",
    label: "Reservas futuras",
    help: "Si vienes de otro programa, exporta las reservas a partir de hoy para pasarlas a Melend/OS.",
    accept: ["xlsx", "xls", "ods", "csv", "pdf", "zip"],
    section: "files",
  },
  {
    kind: "other",
    label: "Otros documentos",
    help: "Cualquier cosa que nos ayude: condiciones, carta de servicios…",
    accept: ["pdf", "xlsx", "xls", "ods", "csv", "txt", "zip", "jpg", "jpeg", "png"],
    section: "files",
  },
];

/** The file kinds that apply to these answers (the web section decides some). */
export function fileKindsFor(data: OnboardingData, section?: "web" | "files"): FileKindDef[] {
  const web = data.web ?? {};
  return FILE_KINDS.filter((k) => (!section || k.section === section) && fieldShown(k, web));
}

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILES = 40;

const CONTENT_TYPES: Record<string, string> = {
  csv: "text/csv",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  zip: "application/zip",
  txt: "text/plain",
};

/** The content type to store a file with, or null if that kind does not take it. */
export function fileContentType(kind: FileKind, name: string): string | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const def = FILE_KINDS.find((k) => k.kind === kind);
  return def && def.accept.includes(ext) ? (CONTENT_TYPES[ext] ?? null) : null;
}

/** Answers by section id; free notes go in extra.notes. */
export type OnboardingData = Record<string, Record<string, unknown>>;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function cleanValue(f: Field, v: unknown): unknown {
  switch (f.type) {
    case "number":
    case "hour": {
      if (v === "" || v === null || v === undefined) return undefined;
      const n = Number(v);
      const [min, max] = f.type === "hour" ? [0, 23] : [f.min ?? 0, f.max ?? 1e9];
      return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
    }
    case "multi":
      return Array.isArray(v)
        ? [...new Set(v.map(String).filter((x) => f.options?.some((o) => o.value === x)))]
        : undefined;
    case "emails": {
      const list = (Array.isArray(v) ? v : String(v ?? "").split(/[\s,;]+/))
        .map((x) => String(x).trim().toLowerCase())
        .filter(Boolean);
      return list.length ? [...new Set(list)].slice(0, 30) : undefined;
    }
    case "select":
      return typeof v === "string" && f.options?.some((o) => o.value === v) ? v : undefined;
    case "color":
      return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined;
    default: {
      if (typeof v !== "string") return undefined;
      const t = v.trim().slice(0, f.max ?? 2000);
      return t || undefined;
    }
  }
}

/** Keeps only the known fields, trimmed and within their limits (drafts too). */
export function cleanOnboardingData(raw: unknown): OnboardingData {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    Record<string, unknown>
  >;
  const out: OnboardingData = {};
  for (const s of SECTIONS) {
    const values = src[s.id] && typeof src[s.id] === "object" ? src[s.id] : {};
    const clean: Record<string, unknown> = {};
    for (const f of s.fields) {
      const v = cleanValue(f, values[f.key]);
      if (v !== undefined) clean[f.key] = v;
    }
    out[s.id] = clean;
  }
  const rawNotes = src.extra && typeof src.extra === "object" ? src.extra.notes : undefined;
  const notes = typeof rawNotes === "string" ? rawNotes.trim().slice(0, 4000) : "";
  out.extra = notes ? { notes } : {};
  return out;
}

/** Whether a field applies, given the other answers of its section. */
export function fieldShown(f: Pick<Field, "when">, values: Record<string, unknown>): boolean {
  if (!f.when) return true;
  const is = Array.isArray(f.when.is) ? f.when.is : [f.when.is];
  return is.includes(values[f.when.key] as string);
}

function missing(f: Field, v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  return Array.isArray(v) && v.length === 0;
}

/** What is missing or wrong to submit the form (empty = it can be sent). */
export function onboardingProblems(data: OnboardingData, fileKinds: FileKind[]): string[] {
  const problems: string[] = [];
  for (const s of SECTIONS) {
    const values = data[s.id] ?? {};
    for (const f of s.fields) {
      if (!fieldShown(f, values)) continue;
      const v = values[f.key];
      if (f.required && missing(f, v)) problems.push(`${s.title}: falta «${f.label}»`);
      if (f.type === "email" && typeof v === "string" && !EMAIL.test(v))
        problems.push(`${s.title}: «${f.label}» no es un email válido`);
      if (f.type === "emails" && Array.isArray(v))
        for (const e of v)
          if (!EMAIL.test(String(e))) problems.push(`${s.title}: «${e}» no es un email válido`);
      if (f.type === "url" && typeof v === "string" && !/^https?:\/\/\S+\.\S+/.test(v))
        problems.push(`${s.title}: «${f.label}» debe empezar por https://`);
    }
  }
  for (const k of fileKindsFor(data))
    if (k.required && !fileKinds.includes(k.kind))
      problems.push(
        `${k.section === "web" ? "Tu web y tus emails" : "Archivos"}: falta «${k.label}»`,
      );
  return problems;
}
