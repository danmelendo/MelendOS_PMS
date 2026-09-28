// What a hotel pays for the software, and what we commit to in return (SLA).
// Source of the pricing page, the calculator and the SLA table. Rationale and
// competitor figures: site/PRICING.md.
//
// The plan ids and packages mirror the product's catalogue
// (supabase/functions/_shared/domain/features.ts in the app: PLAN_PACKAGES and
// MODULES). This site does not import the product: if a module or a plan
// changes there, update PACKAGES and PLAN_PACKAGES here. "hostal" is sold as
// the product plan "starter" with tenants.settings.packages = [] (base only).
//
// Prices in euros, VAT excluded, per bookable room and month, with a monthly
// minimum per plan.

export const PACKAGE_IDS = ["stay", "ai", "chain", "data", "distribution"] as const;
export type PackageId = (typeof PACKAGE_IDS)[number];

/**
 * Legal obligations of a Spanish accommodation and where the product stands.
 * "building" means announced but not available yet: the site must say so.
 */
export const COMPLIANCE: {
  name: string;
  status: "available" | "building";
  detail: string;
}[] = [
  {
    name: "Registro de viajeros",
    status: "available",
    detail:
      "Datos del documento, nacionalidad, domicilio y firma del huésped, con acceso restringido a dirección.",
  },
  {
    name: "Comunicación a SES.HOSPEDAJES",
    status: "available",
    detail:
      "Partes de viajeros y reservas enviados al Ministerio del Interior, con cola y reintentos. Obligatorio desde el 2 de diciembre de 2024.",
  },
  {
    name: "Facturación VeriFactu",
    status: "available",
    detail:
      "Facturas con registro encadenado y código QR enviadas a la Agencia Tributaria. Obligatorio desde 2027 (enero para sociedades, julio para autónomos).",
  },
];

export const BASE_INCLUDES = [
  "Gestión de reservas y habitaciones (PMS)",
  "Web de reservas directas con la plantilla del hotel o incrustada en su web",
  "Registro de viajeros",
  "Pagos online o en el hotel y políticas de cancelación",
];

export const PACKAGES: Record<PackageId, { name: string; description: string; modules: string[] }> =
  {
    stay: {
      name: "Estancia",
      description: "Para atender al huésped durante su estancia sin llamadas ni papeles.",
      modules: ["Chat con recepción", "Cuenta de la estancia", "Reseñas"],
    },
    ai: {
      name: "IA",
      description: "Reservas conversacionales y asistentes conectados al hotel.",
      modules: ["Asistente de reservas IA", "Copiloto de gestión", "Integraciones IA (MCP)"],
    },
    chain: {
      name: "Cadena",
      description: "Para cadenas y grandes hoteles que quieren que el huésped repita.",
      modules: ["Club de fidelización"],
    },
    data: {
      name: "Datos",
      description: "Métricas del negocio y datos listos para análisis y predicción.",
      modules: ["Informes", "Data lake"],
    },
    distribution: {
      name: "Distribución",
      description: "Vende también en OTAs y a touroperadores, con todo en el mismo PMS.",
      modules: ["OTAs, channel managers y touroperadores"],
    },
  };

/** Packages each plan includes (same as the product's PLAN_PACKAGES). */
export const PLAN_PACKAGES: Record<PlanId, PackageId[]> = {
  hostal: [],
  starter: ["stay"],
  pro: ["stay", "ai", "chain", "data", "distribution"],
  group: ["stay", "ai", "chain", "data", "distribution"],
};

export const PLAN_IDS = ["hostal", "starter", "pro", "group"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface Plan {
  name: string;
  tagline: string;
  /** €/room/month. */
  perRoom: number;
  /** Minimum €/month for the whole contract. */
  minimum: number;
  /** One-off onboarding fee (setup, data import, training). */
  onboarding: number;
  /** Onboarding is free when paying a year upfront. */
  onboardingFreeAnnual: boolean;
  onboardingNote: string;
  /** Hotels the plan is meant for; group needs at least two. */
  minHotels: number;
  /**
   * Whether an SLA can be added. Not for hostels (Dan, 27/09/2026): many small
   * places with urgent commitments would overflow a two-person support team.
   */
  slaAvailable: boolean;
  highlights: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  hostal: {
    name: "Hostal",
    tagline:
      "Para hostales y pensiones: lo imprescindible para gestionar, vender directo y cumplir.",
    perRoom: 3,
    minimum: 39,
    onboarding: 99,
    onboardingFreeAnnual: true,
    onboardingNote: "Alta en una videollamada e importación de habitaciones desde Excel o CSV.",
    minHotels: 1,
    slaAvailable: false,
    highlights: [
      "Calendario, reservas y habitaciones",
      "Web de reserva directa sin comisiones",
      "Registro de viajeros y pagos online o en recepción",
    ],
  },
  starter: {
    name: "Esencial",
    tagline: "Para hostales y hoteles pequeños que quieren dejar el Excel y vender directo.",
    perRoom: 4,
    minimum: 69,
    onboarding: 149,
    onboardingFreeAnnual: true,
    onboardingNote: "Alta guiada e importación de habitaciones y reservas desde Excel o CSV.",
    minHotels: 1,
    slaAvailable: true,
    highlights: [
      "PMS y web de reserva directa, propia o en tu web",
      "Chat con recepción, cuenta de la estancia y reseñas",
      "Pagos online o en el hotel, sin comisión por reserva",
    ],
  },
  pro: {
    name: "Profesional",
    tagline: "Todos los módulos para el hotel independiente que quiere crecer.",
    perRoom: 9,
    minimum: 149,
    onboarding: 490,
    onboardingFreeAnnual: false,
    onboardingNote:
      "Migración de datos desde tu sistema actual, configuración de tarifas y canales y 2 h de formación.",
    minHotels: 1,
    slaAvailable: true,
    highlights: [
      "Todo lo de Esencial",
      "Asistente de reservas IA, copiloto de gestión y MCP",
      "OTAs y touroperadores, informes, data lake y club",
    ],
  },
  group: {
    name: "Grupo",
    tagline: "Para cadenas y grupos: varios hoteles, un solo panel y compromisos de empresa.",
    perRoom: 8,
    minimum: 490,
    onboarding: 1490,
    onboardingFreeAnnual: false,
    onboardingNote:
      "Proyecto de implantación por hotel, integraciones a medida y formación por equipos.",
    minHotels: 2,
    slaAvailable: true,
    highlights: [
      "Todo lo de Profesional, en todos los hoteles del grupo",
      "Rol de dirección de grupo y club compartido entre hoteles",
      "Gestor de cuenta y revisión trimestral del servicio",
    ],
  },
};

/** Packages that can be added one by one to Esencial (Profesional has them all). */
export const ADDONS: Partial<Record<PackageId, { perRoom: number; minimum: number }>> = {
  ai: { perRoom: 3, minimum: 59 },
  data: { perRoom: 1, minimum: 19 },
  distribution: { perRoom: 2, minimum: 29 },
};
export type AddonId = "ai" | "data" | "distribution";
export const ADDON_IDS: AddonId[] = ["ai", "data", "distribution"];

/** Annual prepayment discount (the year is paid upfront and not refunded). */
export const ANNUAL_DISCOUNT = 0.05;

/** AI conversations included per hotel and month; beyond that, per conversation. */
export const AI_CONVERSATIONS_INCLUDED = 1000;
export const AI_EXTRA_CONVERSATION = 0.05;

/**
 * Launch programme while we have no references: the first hotels get a bigger
 * annual discount (instead of the standard one), in exchange for feedback and
 * a case study.
 */
export const FOUNDERS = { annualDiscount: 0.1, seats: 10 } as const;

/** Same promises in every plan. */
export const ALWAYS = [
  "Sin permanencia: pago mensual y baja cuando quieras",
  "0 % de comisión sobre las reservas directas",
  "Tus datos son tuyos: exportación completa en cualquier momento",
  "Contrato de encargado del tratamiento (RGPD) incluido",
];

// ── Support and SLA ──────────────────────────────────────────────────────────
// Every plan has basic support without commitments. The SLA is a separate
// service, priced by urgency: a share of the subscription with a minimum,
// since a bigger hotel loses more when the system is down.

/** Support included in every plan (no availability commitment, no credits). */
export const BASE_SUPPORT = {
  channels: "Chat y email, lunes a viernes de 9:00 a 18:00",
  response: "Respuesta en 2 días laborables",
};

export const SLA_IDS = ["priority", "urgent", "always"] as const;
export type SlaId = (typeof SLA_IDS)[number];

export interface SlaTier {
  name: string;
  tagline: string;
  /** Share of the monthly subscription (plan + packages). */
  share: number;
  /** Minimum €/month. */
  minimum: number;
  /** Monthly availability commitment, percent. */
  uptime: number;
  support: string;
  /** First response per priority (critical: the hotel cannot book, check in or charge). */
  response: { critical: string; high: string; normal: string };
  /** Recovery point / time objectives. */
  rpo: string;
  rto: string;
}

export const SLA_TIERS: Record<SlaId, SlaTier> = {
  priority: {
    name: "Prioritario",
    tagline: "Tus incidencias van primero en horario laboral.",
    share: 0.1,
    minimum: 29,
    uptime: 99.5,
    support: "Chat, email y teléfono, lunes a viernes de 9:00 a 18:00",
    response: { critical: "4 h laborables", high: "1 día laborable", normal: "2 días laborables" },
    rpo: "24 h",
    rto: "8 h",
  },
  urgent: {
    name: "Urgente",
    tagline: "Para hoteles que no paran: respuesta en una hora, todos los días.",
    share: 0.2,
    minimum: 89,
    uptime: 99.7,
    support: "Chat, email y teléfono, todos los días de 8:00 a 22:00",
    response: { critical: "1 h", high: "4 h", normal: "1 día laborable" },
    rpo: "24 h",
    rto: "4 h",
  },
  always: {
    name: "24/7",
    tagline: "Guardia de noche y en festivos para lo que no puede esperar.",
    share: 0.3,
    minimum: 390,
    uptime: 99.9,
    support: "Guardia 24/7 para incidencias críticas; resto, todos los días de 8:00 a 22:00",
    response: { critical: "30 min", high: "2 h", normal: "8 h laborables" },
    rpo: "5 min",
    rto: "2 h",
  },
};

export interface QuoteInput {
  plan: PlanId;
  rooms: number;
  hotels?: number;
  addons?: AddonId[];
  sla?: SlaId | null;
  annual?: boolean;
  /** Founder hotel: bigger annual discount (only when paying annually). */
  founder?: boolean;
}

export interface Quote {
  plan: PlanId;
  packages: PackageId[];
  lines: { label: string; amount: number }[];
  /** €/month before the annual discount. */
  monthly: number;
  /** Annual discount applied (0 when paying monthly). */
  discount: number;
  /** €/month actually paid (after the annual discount, if any). */
  effectiveMonthly: number;
  /** €/year actually paid. */
  yearly: number;
  onboarding: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Monthly price of a plan for a number of rooms. Throws on nonsense input. */
export function quote({
  plan,
  rooms,
  hotels = 1,
  addons = [],
  sla = null,
  annual = false,
  founder = false,
}: QuoteInput): Quote {
  const p = PLANS[plan];
  if (!p) throw new Error(`Unknown plan: ${plan}`);
  if (!Number.isInteger(rooms) || rooms < 1) throw new Error("Rooms must be a positive integer");
  if (!Number.isInteger(hotels) || hotels < 1) throw new Error("Hotels must be a positive integer");
  if (hotels < p.minHotels) throw new Error(`${p.name} is for ${p.minHotels} or more hotels`);

  const lines = [
    { label: `${p.name} · ${rooms} hab.`, amount: Math.max(p.minimum, p.perRoom * rooms) },
  ];
  const packages = new Set<PackageId>(PLAN_PACKAGES[plan]);
  // Add-ons only make sense on top of a plan that lacks them.
  for (const id of new Set(addons)) {
    const a = ADDONS[id];
    if (!a || packages.has(id)) continue;
    packages.add(id);
    lines.push({
      label: `Paquete ${PACKAGES[id].name}`,
      amount: Math.max(a.minimum, a.perRoom * rooms),
    });
  }
  if (sla) {
    const t = SLA_TIERS[sla];
    if (!t) throw new Error(`Unknown SLA: ${sla}`);
    if (!p.slaAvailable) throw new Error(`${p.name} has no SLA`);
    const subscription = lines.reduce((s, l) => s + l.amount, 0);
    lines.push({
      label: `SLA ${t.name}`,
      amount: Math.max(t.minimum, round2(subscription * t.share)),
    });
  }
  const monthly = round2(lines.reduce((s, l) => s + l.amount, 0));
  const discount = annual ? (founder ? FOUNDERS.annualDiscount : ANNUAL_DISCOUNT) : 0;
  const effectiveMonthly = round2(monthly * (1 - discount));
  return {
    plan,
    packages: [...packages],
    lines,
    monthly,
    discount,
    effectiveMonthly,
    yearly: round2(effectiveMonthly * 12),
    onboarding: annual && p.onboardingFreeAnnual ? 0 : p.onboarding,
  };
}

export interface PriceOptions {
  sla?: SlaId | null;
  annual?: boolean;
  founder?: boolean;
}

/**
 * The prices a plan card shows, with the chosen SLA and discount already in:
 * what the hotel reads is what it pays, with no extra line appearing later.
 */
export function listPrice(
  plan: PlanId,
  { sla: wanted = null, annual = false, founder = false }: PriceOptions = {},
) {
  const sla = PLANS[plan].slaAvailable ? wanted : null;
  const factor =
    (1 + (sla ? SLA_TIERS[sla].share : 0)) *
    (1 - (annual ? (founder ? FOUNDERS.annualDiscount : ANNUAL_DISCOUNT) : 0));
  const p = PLANS[plan];
  // The minimum of a one-room contract is the plan minimum plus the SLA minimum.
  const minimum = quote({ plan, rooms: 1, hotels: p.minHotels, sla, annual, founder });
  return {
    perRoom: round2(p.perRoom * factor),
    minimum: minimum.effectiveMonthly,
    addonPerRoom: (id: AddonId) => round2((ADDONS[id]?.perRoom ?? 0) * factor),
  };
}

/**
 * The cheapest plan that covers what the hotel asked for (a Starter with every
 * add-on can cost more than Pro). Group only when there are several hotels.
 */
export function suggestPlan(rooms: number, hotels: number, addons: AddonId[]): PlanId {
  if (hotels >= PLANS.group.minHotels) return "group";
  // Small places without extra packages: the essentials are enough.
  if (!addons.length && rooms <= 20) return "hostal";
  const starter = quote({ plan: "starter", rooms, addons });
  const pro = quote({ plan: "pro", rooms });
  return pro.monthly <= starter.monthly ? "pro" : "starter";
}

/**
 * Service credit for a month with an SLA, as a share of that month's fee: 10 %
 * below the commitment, 25 % below 99 %, 50 % below 98 % (the cap). Without an
 * SLA there is no commitment and no credit.
 */
export function slaCredit(sla: SlaId | null, measuredUptime: number): number {
  if (!sla || measuredUptime >= SLA_TIERS[sla].uptime) return 0;
  if (measuredUptime >= 99) return 0.1;
  if (measuredUptime >= 98) return 0.25;
  return 0.5;
}

/** Allowed downtime per 30-day month for an uptime percentage, in minutes. */
export function downtimeMinutes(uptime: number): number {
  return Math.round((30 * 24 * 60 * (100 - uptime)) / 100);
}

// ── Unit economics (internal: not shown on the site) ─────────────────────────
// Prices must pay for two people working on this full time, with a margin.
// Assumptions explained in site/PRICING.md; change them here and the tests
// say whether the prices still hold.

export const COSTS = {
  /** Two people, 42.000 € gross a year each plus employer social security. */
  team: 9200,
  /** Production infrastructure with PITR, base AI, monitoring, accounting, insurance, tools, marketing. */
  fixed: 900,
  /** Internal cost of one hour: team cost / ~260 productive hours a month. */
  hourly: 35,
  /** Support hours the two of us can give a month (half the time; the rest is product and sales). */
  supportCapacity: 150,
} as const;

/** Monthly cost of serving one contract: support hours and variable infrastructure/AI. */
export const SERVE_COST: Record<PlanId, { hours: number; variable: number }> = {
  // Fewer modules, fewer questions.
  hostal: { hours: 0.5, variable: 2 },
  starter: { hours: 1, variable: 3 },
  // ~1.000 AI conversations at ~0,01 € plus storage and functions.
  pro: { hours: 1.5, variable: 15 },
  // Several hotels and an account manager.
  group: { hours: 4, variable: 40 },
};

/** Extra monthly cost of each SLA: support hours and, for 24/7, on-call and PITR. */
export const SLA_SERVE_COST: Record<SlaId, { hours: number; variable: number }> = {
  priority: { hours: 0.5, variable: 0 },
  urgent: { hours: 1, variable: 10 },
  always: { hours: 3, variable: 150 },
};

/** Share of the monthly revenue left after all costs that we aim for. */
export const TARGET_MARGIN = 0.2;

/** Expected customer mix: share of contracts and typical size of each plan. No SLA assumed (upside). */
export const TYPICAL_MIX: Record<PlanId, { share: number; rooms: number; hotels: number }> = {
  hostal: { share: 0.25, rooms: 10, hotels: 1 },
  starter: { share: 0.25, rooms: 20, hotels: 1 },
  pro: { share: 0.4, rooms: 35, hotels: 1 },
  group: { share: 0.1, rooms: 120, hotels: 2 },
};

/** How many contracts the business needs to break even and to reach the target margin. */
export function unitEconomics(mix = TYPICAL_MIX) {
  let revenue = 0;
  let variable = 0;
  let hours = 0;
  for (const id of PLAN_IDS) {
    const m = mix[id];
    revenue += m.share * quote({ plan: id, rooms: m.rooms, hotels: m.hotels }).monthly;
    variable += m.share * SERVE_COST[id].variable;
    hours += m.share * SERVE_COST[id].hours;
  }
  const fixed = COSTS.team + COSTS.fixed;
  const breakEven = Math.ceil(fixed / (revenue - variable));
  const target = Math.ceil(fixed / (revenue * (1 - TARGET_MARGIN) - variable));
  return {
    /** Average monthly revenue per contract. */
    revenue: round2(revenue),
    breakEven,
    target,
    /** Support hours a month at the target, against COSTS.supportCapacity. */
    supportHours: Math.round(target * hours),
  };
}
