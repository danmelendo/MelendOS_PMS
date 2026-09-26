// What a hotel pays for the software, and what we commit to in return (SLA).
// Source of the pricing page, the calculator and the SLA table. Rationale and
// competitor figures: site/PRICING.md.
//
// The plan ids and packages mirror the product's catalogue
// (supabase/functions/_shared/domain/features.ts in the app: PLAN_PACKAGES and
// MODULES). This site does not import the product: if a module or a plan
// changes there, update PACKAGES and PLAN_PACKAGES here.
//
// Prices in euros, VAT excluded, per bookable room and month, with a monthly
// minimum per plan.

export const PACKAGE_IDS = ["stay", "ai", "chain", "data", "distribution"] as const;
export type PackageId = (typeof PACKAGE_IDS)[number];

export const BASE_INCLUDES = [
  "Gestión de reservas y habitaciones (PMS)",
  "Web de reservas directas y app del huésped",
  "Registro de viajeros",
  "Pagos online o en el hotel y políticas de cancelación",
];

export const PACKAGES: Record<PackageId, { name: string; description: string; modules: string[] }> =
  {
    stay: {
      name: "Estancia",
      description: "Para atender al huésped durante su estancia sin llamadas ni papeles.",
      modules: ["Chat con recepción", "Cuenta de la estancia", "Reseñas", "Experiencias"],
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
  starter: ["stay"],
  pro: ["stay", "ai", "chain", "data", "distribution"],
  group: ["stay", "ai", "chain", "data", "distribution"],
};

export const PLAN_IDS = ["starter", "pro", "group"] as const;
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
  onboardingNote: string;
  /** Hotels the plan is meant for; group needs at least two. */
  minHotels: number;
  sla: Sla;
  highlights: string[];
}

export interface Sla {
  /** Monthly availability commitment, percent. */
  uptime: number;
  support: string;
  /** First response per priority (critical: the hotel cannot book or check in). */
  response: { critical: string; high: string; normal: string };
  /** Recovery point / time objectives. */
  rpo: string;
  rto: string;
  extras: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    name: "Esencial",
    tagline: "Para hostales y hoteles pequeños que quieren dejar el Excel y vender directo.",
    perRoom: 4,
    minimum: 49,
    onboarding: 0,
    onboardingNote: "Alta guiada e importación de habitaciones y reservas desde Excel o CSV.",
    minHotels: 1,
    sla: {
      uptime: 99.5,
      support: "Chat y email, lunes a viernes de 9:00 a 18:00",
      response: {
        critical: "4 h laborables",
        high: "1 día laborable",
        normal: "2 días laborables",
      },
      rpo: "24 h",
      rto: "8 h",
      extras: [],
    },
    highlights: [
      "PMS, web de reserva directa y app del huésped",
      "Chat con recepción, cuenta de la estancia y reseñas",
      "Pagos online o en el hotel, sin comisión por reserva",
    ],
  },
  pro: {
    name: "Profesional",
    tagline: "Todos los módulos para el hotel independiente que quiere crecer.",
    perRoom: 7,
    minimum: 119,
    onboarding: 290,
    onboardingNote:
      "Migración de datos desde tu sistema actual, configuración de tarifas y canales y 2 h de formación.",
    minHotels: 1,
    sla: {
      uptime: 99.7,
      support: "Chat, email y teléfono, todos los días de 8:00 a 22:00",
      response: { critical: "1 h", high: "4 h", normal: "1 día laborable" },
      rpo: "24 h",
      rto: "4 h",
      extras: [],
    },
    highlights: [
      "Todo lo de Esencial",
      "Asistente de reservas IA, copiloto de gestión y MCP",
      "OTAs y touroperadores, informes, data lake y club",
    ],
  },
  group: {
    name: "Grupo",
    tagline: "Para cadenas y grupos: varios hoteles, un solo panel y compromisos de empresa.",
    perRoom: 6,
    minimum: 390,
    onboarding: 990,
    onboardingNote:
      "Desde 990 €: proyecto de implantación por hotel, integraciones a medida y formación por equipos.",
    minHotels: 2,
    sla: {
      uptime: 99.9,
      support: "Guardia 24/7 para incidencias críticas; resto, todos los días de 8:00 a 22:00",
      response: { critical: "30 min", high: "2 h", normal: "8 h laborables" },
      rpo: "5 min",
      rto: "2 h",
      extras: [
        "Gestor de cuenta y revisión trimestral del servicio",
        "Salida sin penalización si la disponibilidad baja del 99 % dos meses seguidos",
      ],
    },
    highlights: [
      "Todo lo de Profesional, en todos los hoteles del grupo",
      "Rol de dirección de grupo y club compartido entre hoteles",
      "SLA del 99,9 % con guardia 24/7",
    ],
  },
};

/** Packages that can be added one by one to Esencial (Profesional has them all). */
export const ADDONS: Partial<Record<PackageId, { perRoom: number; minimum: number }>> = {
  ai: { perRoom: 2, minimum: 29 },
  data: { perRoom: 1, minimum: 15 },
  distribution: { perRoom: 1.5, minimum: 19 },
};
export type AddonId = "ai" | "data" | "distribution";
export const ADDON_IDS: AddonId[] = ["ai", "data", "distribution"];

/** Annual prepayment discount. */
export const ANNUAL_DISCOUNT = 0.15;

/** AI conversations included per hotel and month; beyond that, per conversation. */
export const AI_CONVERSATIONS_INCLUDED = 1000;
export const AI_EXTRA_CONVERSATION = 0.05;

/** Launch programme while we have no references: first hotels, in exchange for a case study. */
export const FOUNDERS = { discount: 0.3, months: 24, seats: 10 } as const;

/** Money back if the hotel leaves in the first days. */
export const GUARANTEE_DAYS = 60;

/** Same promises in every plan. */
export const ALWAYS = [
  "Sin permanencia: pago mensual y baja cuando quieras",
  "0 % de comisión sobre las reservas directas",
  "Tus datos son tuyos: exportación completa en cualquier momento",
  `Garantía de ${GUARANTEE_DAYS} días: si no te convence, te devolvemos las cuotas`,
  "Contrato de encargado del tratamiento (RGPD) incluido",
];

export interface QuoteInput {
  plan: PlanId;
  rooms: number;
  hotels?: number;
  addons?: AddonId[];
  annual?: boolean;
}

export interface Quote {
  plan: PlanId;
  packages: PackageId[];
  lines: { label: string; amount: number }[];
  /** €/month before the annual discount. */
  monthly: number;
  /** €/month actually paid (after the annual discount, if any). */
  effectiveMonthly: number;
  /** €/year actually paid. */
  yearly: number;
  onboarding: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Monthly price of a plan for a number of rooms. Throws on nonsense input. */
export function quote({ plan, rooms, hotels = 1, addons = [], annual = false }: QuoteInput): Quote {
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
  const monthly = round2(lines.reduce((s, l) => s + l.amount, 0));
  const effectiveMonthly = round2(annual ? monthly * (1 - ANNUAL_DISCOUNT) : monthly);
  return {
    plan,
    packages: [...packages],
    lines,
    monthly,
    effectiveMonthly,
    yearly: round2(effectiveMonthly * 12),
    onboarding: p.onboarding,
  };
}

/**
 * The cheapest plan that covers what the hotel asked for (a Starter with every
 * add-on can cost more than Pro). Group only when there are several hotels.
 */
export function suggestPlan(rooms: number, hotels: number, addons: AddonId[]): PlanId {
  if (hotels >= PLANS.group.minHotels) return "group";
  const starter = quote({ plan: "starter", rooms, addons });
  const pro = quote({ plan: "pro", rooms });
  return pro.monthly <= starter.monthly ? "pro" : "starter";
}

/**
 * SLA service credit for a month, as a share of that month's fee: 10 % below
 * the commitment, 25 % below 99 %, 50 % below 98 % (the cap).
 */
export function slaCredit(plan: PlanId, measuredUptime: number): number {
  if (measuredUptime >= PLANS[plan].sla.uptime) return 0;
  if (measuredUptime >= 99) return 0.1;
  if (measuredUptime >= 98) return 0.25;
  return 0.5;
}

/** Allowed downtime per 30-day month for an uptime percentage, in minutes. */
export function downtimeMinutes(uptime: number): number {
  return Math.round((30 * 24 * 60 * (100 - uptime)) / 100);
}
