import { supabase } from "@/integrations/supabase/client";
import { localYmd } from "@domain/dates.ts";
import { priceStay, round2, type DynamicRule, type PriceBreakdown } from "@domain/pricing.ts";
import type { Reservation } from "./data";

export type { PriceBreakdown };
export { round2 };

export interface NightlyPriceInput {
  rateGroupId: string;
  checkIn: Date; // first night
  checkOut: Date; // departure day (not slept)
  extras: { extraId: string; qty: number; price: number }[];
}

// Statuses that actually hold a room. pending (abandoned payments) and rejected
// must NOT inflate occupancy, otherwise the surcharge fires when rooms are free.
const OCCUPYING_STATUSES = ["confirmed", "in_progress", "completed"] as const;

// Loads everything the pricing engine needs from the data client and delegates
// the calculation to the pure domain function (@domain/pricing.ts), which the
// Edge Functions reuse.
export async function calculateNightlyPrice(input: NightlyPriceInput): Promise<PriceBreakdown> {
  const checkIn = localYmd(input.checkIn);
  const checkOut = localYmd(input.checkOut);
  const extrasTotal = input.extras.reduce((s, e) => s + e.qty * e.price, 0);

  const [rateRes, rulesRes, giftsRes] = await Promise.all([
    supabase
      .from("rate_nightly")
      .select("price, weekend_price")
      .eq("rate_group_id", input.rateGroupId)
      .maybeSingle(),
    supabase.from("dynamic_rules").select("*").eq("active", true),
    supabase
      .from("gift_thresholds")
      .select("*")
      .eq("active", true)
      .lte("min_extras_total", extrasTotal),
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
        .lt("start_at", input.checkOut.toISOString())
        .gt("end_at", input.checkIn.toISOString())
        .in("status", [...OCCUPYING_STATUSES]),
      supabase.from("rooms").select("id", { count: "exact", head: true }).eq("active", true),
    ]);
    if (occError) throw occError;
    if (roomsError) throw roomsError;
    occupied = (stays ?? []).map((s) => ({
      checkIn: localYmd(new Date(s.start_at)),
      checkOut: localYmd(new Date(s.end_at)),
    }));
    totalRooms = Math.max(count ?? 1, 1);
  }

  return priceStay({
    checkIn,
    checkOut,
    rate: {
      price: Number(rateRes.data?.price ?? 0),
      weekendPrice: rateRes.data?.weekend_price != null ? Number(rateRes.data.weekend_price) : null,
    },
    rules,
    occupied,
    totalRooms,
    extras: input.extras,
    gifts: (giftsRes.data ?? []).map((g) => ({
      minExtrasTotal: Number(g.min_extras_total),
      giftExtraId: g.gift_extra_id,
    })),
  });
}

export type ReservationWithRoom = Reservation & {
  rooms: { id: string; name: string; building: string } | null;
  customers: { id: string; name: string | null; phone: string | null } | null;
};
