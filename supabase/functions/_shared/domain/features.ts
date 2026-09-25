// Modules a hotel (tenant) can switch on. The defaults follow the plan:
// - starter: hostels and traditional hotels. Guests book, register (online
//   check-in) and talk to reception; no loyalty club.
// - pro / group: large hotels and chains, where a loyalty club makes guests
//   come back to the group's hotels.
// Each hotel can override any module in tenants.settings.features.
// Mirrored in SQL by public.tenant_feature().

export const FEATURES = ["loyalty", "experiences", "reviews", "chat", "folio"] as const;
export type Feature = (typeof FEATURES)[number];
export type Features = Record<Feature, boolean>;

const CLUB_PLANS = new Set(["pro", "group"]);

export function tenantFeatures(
  plan: string | null | undefined,
  settings: { features?: Partial<Record<string, unknown>> } | null | undefined,
): Features {
  const overrides = settings?.features ?? {};
  const pick = (f: Feature, fallback: boolean) =>
    typeof overrides[f] === "boolean" ? (overrides[f] as boolean) : fallback;
  return {
    loyalty: pick("loyalty", CLUB_PLANS.has(plan ?? "")),
    experiences: pick("experiences", true),
    reviews: pick("reviews", true),
    chat: pick("chat", true),
    folio: pick("folio", true),
  };
}
