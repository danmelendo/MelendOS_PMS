// What each hotel (tenant) has contracted. The product is sold in packages on
// top of a base every hotel gets, so a hostel does not carry what a chain
// needs:
// - base (always): PMS, direct bookings on the hotel's web and guest app,
//   guest registration, payments and cancellation policies.
// - optional packages, each a set of modules (PACKAGES below).
//
// A hotel's packages are tenants.settings.packages; without it, the defaults of
// its plan (PLAN_PACKAGES). Any single module can still be switched on or off
// in tenants.settings.features (a custom deal or a trial).
// One code base for every hotel: this is configuration, never a fork.
// Mirrored in SQL by public.tenant_feature(); the server checks it too.

export const PACKAGE_IDS = ["stay", "ai", "chain", "data", "distribution"] as const;
export type PackageId = (typeof PACKAGE_IDS)[number];

export const FEATURES = [
  "chat",
  "folio",
  "reviews",
  "experiences",
  "ai_agent",
  "mcp",
  "copilot",
  "loyalty",
  "reports",
  "data_lake",
  "channels",
] as const;
export type Feature = (typeof FEATURES)[number];
export type Features = Record<Feature, boolean>;

export interface ModuleInfo {
  name: string;
  description: string;
  package: PackageId;
}

/** Catalogue (Spanish copy, shown in the panel and the sales web). */
export const MODULES: Record<Feature, ModuleInfo> = {
  chat: {
    name: "Chat con recepción",
    description: "Peticiones y servicio de habitaciones por chat en tiempo real con recepción.",
    package: "stay",
  },
  folio: {
    name: "Cuenta de la estancia",
    description: "Cargos a la habitación, ampliación de la estancia y pago de la cuenta al salir.",
    package: "stay",
  },
  reviews: {
    name: "Reseñas",
    description: "Valoraciones de estancias verificadas, con respuesta del hotel.",
    package: "stay",
  },
  experiences: {
    name: "Experiencias",
    description: "Agenda de actividades del hotel con inscripción de los huéspedes.",
    package: "stay",
  },
  ai_agent: {
    name: "Asistente de reservas IA",
    description: "Un asistente en la web que busca, cotiza y reserva conversando con el cliente.",
    package: "ai",
  },
  mcp: {
    name: "Integraciones IA (MCP)",
    description: "Conecta Claude u otros asistentes a las herramientas de reservas del hotel.",
    package: "ai",
  },
  copilot: {
    name: "Copiloto de gestión",
    description:
      "Preguntas sobre el negocio en lenguaje natural, respondidas con los datos del hotel.",
    package: "ai",
  },
  loyalty: {
    name: "Club de fidelización",
    description: "Puntos, niveles y recompensas para que el huésped repita en el grupo.",
    package: "chain",
  },
  reports: {
    name: "Informes",
    description: "Ocupación, ADR, RevPAR, antelación, cancelaciones y canales.",
    package: "data",
  },
  channels: {
    name: "OTAs y touroperadores",
    description:
      "Recibe reservas de OTAs, channel managers y touroperadores y les envía la disponibilidad.",
    package: "distribution",
  },
  data_lake: {
    name: "Data lake",
    description: "Exportación diaria de los datos del hotel para análisis y modelos de predicción.",
    package: "data",
  },
};

export const PACKAGES: Record<PackageId, { name: string; description: string }> = {
  stay: {
    name: "Estancia",
    description: "Para atender al huésped durante su estancia sin llamadas ni papeles.",
  },
  ai: {
    name: "IA",
    description: "Reservas conversacionales y asistentes conectados al hotel.",
  },
  chain: {
    name: "Cadena",
    description: "Para cadenas y grandes hoteles que quieren que el huésped repita.",
  },
  data: {
    name: "Datos",
    description: "Métricas del negocio y datos listos para análisis y predicción.",
  },
  distribution: {
    name: "Distribución",
    description: "Vende también en OTAs y a touroperadores, con todo en el mismo PMS.",
  },
};

export const BASE_INCLUDES = [
  "Gestión de reservas y habitaciones (PMS)",
  "Web de reservas directas y app del huésped",
  "Registro de viajeros",
  "Pagos online o en el hotel y políticas de cancelación",
];

/** Packages each plan includes when the hotel has not chosen its own. */
export const PLAN_PACKAGES: Record<string, PackageId[]> = {
  starter: ["stay"],
  pro: ["stay", "ai", "chain", "data", "distribution"],
  group: ["stay", "ai", "chain", "data", "distribution"],
};

type Settings = { packages?: unknown; features?: Partial<Record<string, unknown>> } | null;

const isPackage = (p: unknown): p is PackageId =>
  typeof p === "string" && (PACKAGE_IDS as readonly string[]).includes(p);

/** The hotel's packages: its own list if it has one, otherwise its plan's. */
export function tenantPackages(plan: string | null | undefined, settings: Settings | undefined) {
  if (Array.isArray(settings?.packages)) return settings.packages.filter(isPackage);
  return PLAN_PACKAGES[plan ?? ""] ?? PLAN_PACKAGES.starter;
}

export function tenantFeatures(
  plan: string | null | undefined,
  settings: Settings | undefined,
): Features {
  const packages = new Set(tenantPackages(plan, settings));
  const overrides = settings?.features ?? {};
  const out = {} as Features;
  for (const f of FEATURES) {
    out[f] =
      typeof overrides[f] === "boolean"
        ? (overrides[f] as boolean)
        : packages.has(MODULES[f].package);
  }
  return out;
}
