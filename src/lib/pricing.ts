import { supabase } from "@/integrations/supabase/client";
import { localYmd } from "@domain/dates.ts";
import { priceStay, round2, type DynamicRule, type PriceBreakdown } from "@domain/pricing.ts";
import type { Reservation } from "./data";

export type { PriceBreakdown };
export { round2 };

export interface NightlyPriceInput {
  /** The hotel: rules, gifts and occupancy are the hotel's own. */
  tenantId: string;
  rateGroupId: string;
  checkIn: Date; // first night
  checkOut: Date; // departure day (not slept)
  extras: { extraId: string; qty: number; price: number }[];
}

// Statuses that actually hold a room. pending (abandoned payments) and rejected
// must NOT inflate occupancy, otherwise the surcharge fires when rooms are free.
const OCCUPYING_STATUSES = ["confirmed", "in_progress", "completed"] as const;

/** What pricing a stay needs, loaded once for a hotel and a range of dates. */
export interface PricingContext {
  checkIn: string;
  checkOut: string;
  rates: Map<string, { price: number; weekendPrice: number | null }>;
  rules: DynamicRule[];
  gifts: { minExtrasTotal: number; giftExtraId: string }[];
  occupied: { checkIn: string; checkOut: string }[];
  totalRooms: number;
}

// Loads everything the pricing engine needs, for several room types at once
// and scoped to the hotel (rules, gifts and occupancy of other hotels must not
// leak into the price), in two rounds of parallel queries at most. The
// calculation itself is the pure domain function (@domain/pricing.ts), which
// the Edge Functions reuse; the price charged is always the server's.
export async function loadPricingContext(q: {
  tenantId: string;
  rateGroupIds: string[];
  checkIn: Date;
  checkOut: Date;
}): Promise<PricingContext> {
  const ids = [...new Set(q.rateGroupIds)];
  const [rateRes, rulesRes, giftsRes] = await Promise.all([
    supabase
      .from("rate_nightly")
      .select("rate_group_id, price, weekend_price")
      .in("rate_group_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("dynamic_rules").select("*").eq("tenant_id", q.tenantId).eq("active", true),
    supabase.from("gift_thresholds").select("*").eq("tenant_id", q.tenantId).eq("active", true),
  ]);
  if (rateRes.error) throw rateRes.error;
  if (rulesRes.error) throw rulesRes.error;
  if (giftsRes.error) throw giftsRes.error;

  const rules: DynamicRule[] = [];
  for (const r of rulesRes.data ?? []) {
    const cfg = (r.config ?? {}) as { from?: string; to?: string; threshold?: number };
    const multiplier = Number(r.multiplier ?? 0);
    if (r.type === "date" && cfg.from && cfg.to) {
      rules.push({ name: r.name, type: "date", multiplier, from: cfg.from, to: cfg.to });
    } else if (r.type === "occupancy") {
      rules.push({ name: r.name, type: "occupancy", multiplier, threshold: cfg.threshold ?? 0 });
    }
  }

  // Occupancy is only fetched when an occupancy rule exists.
  let occupied: { checkIn: string; checkOut: string }[] = [];
  let totalRooms = 1;
  if (rules.some((r) => r.type === "occupancy")) {
    const [{ data: stays, error: occError }, { count, error: roomsError }] = await Promise.all([
      supabase
        .from("reservations")
        .select("start_at, end_at")
        .eq("tenant_id", q.tenantId)
        .lt("start_at", q.checkOut.toISOString())
        .gt("end_at", q.checkIn.toISOString())
        .in("status", [...OCCUPYING_STATUSES]),
      supabase
        .from("rooms")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", q.tenantId)
        .eq("active", true),
    ]);
    if (occError) throw occError;
    if (roomsError) throw roomsError;
    occupied = (stays ?? []).map((s) => ({
      checkIn: localYmd(new Date(s.start_at)),
      checkOut: localYmd(new Date(s.end_at)),
    }));
    totalRooms = Math.max(count ?? 1, 1);
  }

  const rates = new Map<string, { price: number; weekendPrice: number | null }>();
  for (const r of rateRes.data ?? []) {
    rates.set(r.rate_group_id, {
      price: Number(r.price ?? 0),
      weekendPrice: r.weekend_price != null ? Number(r.weekend_price) : null,
    });
  }
  return {
    checkIn: localYmd(q.checkIn),
    checkOut: localYmd(q.checkOut),
    rates,
    rules,
    gifts: (giftsRes.data ?? []).map((g) => ({
      minExtrasTotal: Number(g.min_extras_total),
      giftExtraId: g.gift_extra_id,
    })),
    occupied,
    totalRooms,
  };
}

/** Price of a stay for one room type, from a loaded context (no queries). */
export function priceFromContext(
  ctx: PricingContext,
  rateGroupId: string,
  extras: NightlyPriceInput["extras"] = [],
): PriceBreakdown {
  const extrasTotal = extras.reduce((s, e) => s + e.qty * e.price, 0);
  return priceStay({
    checkIn: ctx.checkIn,
    checkOut: ctx.checkOut,
    rate: ctx.rates.get(rateGroupId) ?? { price: 0, weekendPrice: null },
    rules: ctx.rules,
    occupied: ctx.occupied,
    totalRooms: ctx.totalRooms,
    extras,
    gifts: ctx.gifts.filter((g) => g.minExtrasTotal <= extrasTotal),
  });
}

export async function calculateNightlyPrice(input: NightlyPriceInput): Promise<PriceBreakdown> {
  const ctx = await loadPricingContext({
    tenantId: input.tenantId,
    rateGroupIds: [input.rateGroupId],
    checkIn: input.checkIn,
    checkOut: input.checkOut,
  });
  return priceFromContext(ctx, input.rateGroupId, input.extras);
}

export type ReservationWithRoom = Reservation & {
  rooms: { id: string; name: string; building: string } | null;
  customers: { id: string; name: string | null; phone: string | null } | null;
};
