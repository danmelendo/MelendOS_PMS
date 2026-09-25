// Nightly pricing engine. Pure: the caller loads the rate, rules, occupancy and
// gift thresholds and passes them in, so the same function runs in the browser
// (demo and panel) and in Edge Functions (quotes for the booking agent).
import { dayOfWeek, eachNight, type Ymd } from "./dates.ts";

export interface NightlyRate {
  /** Price per night, Sunday to Thursday. */
  price: number;
  /** Price for Friday and Saturday nights; null means same as `price`. */
  weekendPrice: number | null;
}

export type DynamicRule =
  | { name: string; type: "date"; multiplier: number; from: Ymd; to: Ymd }
  | { name: string; type: "occupancy"; multiplier: number; threshold: number };

/** An existing stay that occupies a room, as check-in/check-out dates. */
export interface OccupiedStay {
  checkIn: Ymd;
  checkOut: Ymd;
}

export interface GiftThreshold {
  minExtrasTotal: number;
  giftExtraId: string;
}

export interface ExtraLine {
  extraId: string;
  qty: number;
  price: number;
}

export interface PriceStayInput {
  checkIn: Ymd;
  checkOut: Ymd;
  rate: NightlyRate;
  rules: DynamicRule[];
  /** Stays that hold a room over the window; only used by occupancy rules. */
  occupied: OccupiedStay[];
  totalRooms: number;
  extras: ExtraLine[];
  gifts: GiftThreshold[];
}

export interface PriceBreakdown {
  base: number;
  dynamicSurcharge: number;
  dynamicReason: string | null;
  extrasTotal: number;
  giftedExtraIds: string[];
  total: number;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isWeekendNight(night: Ymd): boolean {
  const dow = dayOfWeek(night);
  return dow === 5 || dow === 6; // Friday, Saturday
}

function occupancyPct(night: Ymd, occupied: OccupiedStay[], totalRooms: number): number {
  const busy = occupied.filter((s) => s.checkIn <= night && night < s.checkOut).length;
  return (busy / Math.max(1, totalRooms)) * 100;
}

// Price a stay night by night:
// - base: weekday or weekend price for each night;
// - date rules add their % to every night inside [from, to] (they stack);
// - occupancy rules: the highest threshold reached that night adds its %;
// - extras are added on top; gift thresholds mark extras as free.
export function priceStay(input: PriceStayInput): PriceBreakdown {
  const nights = eachNight(input.checkIn, input.checkOut);
  const weekdayPrice = input.rate.price;
  const weekendPrice = input.rate.weekendPrice ?? weekdayPrice;
  const dateRules = input.rules.filter((r) => r.type === "date");
  const occRules = input.rules
    .filter((r) => r.type === "occupancy")
    .sort((a, b) => b.threshold - a.threshold);

  let base = 0;
  let dynamicSurcharge = 0;
  const reasons = new Set<string>();

  for (const night of nights) {
    const nightPrice = isWeekendNight(night) ? weekendPrice : weekdayPrice;
    base += nightPrice;

    for (const r of dateRules) {
      if (night >= r.from && night <= r.to) {
        dynamicSurcharge += nightPrice * (r.multiplier / 100);
        reasons.add(`${r.name} (+${r.multiplier}%)`);
      }
    }

    if (occRules.length > 0) {
      const pct = occupancyPct(night, input.occupied, input.totalRooms);
      const hit = occRules.find((r) => pct >= r.threshold);
      if (hit) {
        dynamicSurcharge += nightPrice * (hit.multiplier / 100);
        reasons.add(`Ocupación ≥ ${hit.threshold}% (+${hit.multiplier}%)`);
      }
    }
  }

  const extrasTotal = input.extras.reduce((s, e) => s + e.qty * e.price, 0);
  const giftedExtraIds = input.gifts
    .filter((g) => extrasTotal >= g.minExtrasTotal)
    .sort((a, b) => b.minExtrasTotal - a.minExtrasTotal)
    .map((g) => g.giftExtraId);

  return {
    base: round2(base),
    dynamicSurcharge: round2(dynamicSurcharge),
    dynamicReason: reasons.size ? [...reasons].join(" · ") : null,
    extrasTotal: round2(extrasTotal),
    giftedExtraIds,
    total: round2(base + dynamicSurcharge + extrasTotal),
  };
}
