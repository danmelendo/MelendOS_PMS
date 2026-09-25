// Hotel KPIs from stay facts. One implementation for the panel on the real
// backend (facts from the `report_stays` SQL function) and in the demo mock
// (facts from the in-browser data), so both show the same numbers.
//
// Definitions (standard hotel metrics):
// - A stay occupies the nights checkIn … checkOut-1, in the hotel's timezone.
// - Sold nights: stays confirmed, in house or completed. Pending, cancelled,
//   rejected and no-shows do not count.
// - Occupancy = sold nights / available room-nights.
// - ADR (average daily rate) = room revenue / sold nights.
// - RevPAR (revenue per available room) = room revenue / available room-nights.
// - Room revenue excludes extras and is spread evenly over the stay's nights.
// - Booking metrics (lead time, cancellations, channels) use the stays created
//   in the period.
import { addDays, eachNight, nightsBetween, type Ymd } from "./dates.ts";
import { round2 } from "./pricing.ts";

export interface StayFact {
  tenantId: string;
  roomId: string;
  checkIn: Ymd;
  checkOut: Ymd;
  /** Booking date in the hotel's timezone. */
  created: Ymd;
  /** Cancellation date, if cancelled. */
  cancelled: Ymd | null;
  status: string;
  /** Who made the booking: public (web), member, agent, admin (desk/phone)… */
  channel: string | null;
  guests: number;
  /** Accommodation revenue of the whole stay (no extras). */
  roomRevenue: number;
}

export const SOLD_STATUSES = ["confirmed", "in_progress", "completed"] as const;
const isSold = (f: StayFact) => (SOLD_STATUSES as readonly string[]).includes(f.status);

export interface DayKpi {
  day: Ymd;
  available: number;
  sold: number;
  revenue: number;
  occupancy: number;
  adr: number;
  revpar: number;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

function withRates(day: Ymd, available: number, sold: number, revenue: number): DayKpi {
  return {
    day,
    available,
    sold,
    revenue: round2(revenue),
    occupancy: ratio(sold, available),
    adr: round2(ratio(revenue, sold)),
    revpar: round2(ratio(revenue, available)),
  };
}

/** Days from `from` to `to`, both included. */
export function daysIn(from: Ymd, to: Ymd): Ymd[] {
  const n = nightsBetween(from, to);
  return n < 0 ? [] : Array.from({ length: n + 1 }, (_, i) => addDays(from, i));
}

/** Occupancy, ADR and RevPAR for each day of [from, to]. */
export function dailyKpis(facts: StayFact[], rooms: number, from: Ymd, to: Ymd): DayKpi[] {
  const sold = new Map<Ymd, number>();
  const revenue = new Map<Ymd, number>();
  for (const f of facts) {
    if (!isSold(f)) continue;
    const nights = eachNight(f.checkIn, f.checkOut);
    if (!nights.length) continue;
    const perNight = f.roomRevenue / nights.length;
    for (const d of nights) {
      if (d < from || d > to) continue;
      sold.set(d, (sold.get(d) ?? 0) + 1);
      revenue.set(d, (revenue.get(d) ?? 0) + perNight);
    }
  }
  return daysIn(from, to).map((d) => withRates(d, rooms, sold.get(d) ?? 0, revenue.get(d) ?? 0));
}

/** Days grouped by month ("yyyy-MM"). */
export function monthlyKpis(days: DayKpi[]): (Omit<DayKpi, "day"> & { month: string })[] {
  const byMonth = new Map<string, { available: number; sold: number; revenue: number }>();
  for (const d of days) {
    const m = d.day.slice(0, 7);
    const acc = byMonth.get(m) ?? { available: 0, sold: 0, revenue: 0 };
    acc.available += d.available;
    acc.sold += d.sold;
    acc.revenue += d.revenue;
    byMonth.set(m, acc);
  }
  return [...byMonth].map(([month, a]) => {
    const { day: _day, ...rest } = withRates(month, a.available, a.sold, a.revenue);
    return { month, ...rest };
  });
}

export interface BookingStats {
  bookings: number;
  cancelled: number;
  noShows: number;
  cancelRate: number;
  avgLeadDays: number;
  avgLengthOfStay: number;
  channels: Record<string, number>;
}

/** Stays booked in [from, to] (by booking date). */
export function bookingStats(facts: StayFact[], from: Ymd, to: Ymd): BookingStats {
  const booked = facts.filter(
    (f) => f.created >= from && f.created <= to && f.status !== "rejected",
  );
  const channels: Record<string, number> = {};
  let lead = 0;
  let los = 0;
  for (const f of booked) {
    const c = f.channel ?? "other";
    channels[c] = (channels[c] ?? 0) + 1;
    lead += Math.max(0, nightsBetween(f.created, f.checkIn));
    los += nightsBetween(f.checkIn, f.checkOut);
  }
  const cancelled = booked.filter((f) => f.status === "cancelled").length;
  return {
    bookings: booked.length,
    cancelled,
    noShows: booked.filter((f) => f.status === "no_show").length,
    cancelRate: ratio(cancelled, booked.length),
    avgLeadDays: round2(ratio(lead, booked.length)),
    avgLengthOfStay: round2(ratio(los, booked.length)),
    channels,
  };
}

/** Bookings and cancellations per booking month ("yyyy-MM"). */
export function bookingsByMonth(facts: StayFact[], from: Ymd, to: Ymd) {
  const byMonth = new Map<string, { bookings: number; cancelled: number }>();
  for (const m of new Set(daysIn(from, to).map((d) => d.slice(0, 7)))) {
    byMonth.set(m, { bookings: 0, cancelled: 0 });
  }
  for (const f of facts) {
    if (f.created < from || f.created > to || f.status === "rejected") continue;
    const acc = byMonth.get(f.created.slice(0, 7));
    if (!acc) continue;
    acc.bookings += 1;
    if (f.status === "cancelled") acc.cancelled += 1;
  }
  return [...byMonth].map(([month, a]) => ({
    month,
    ...a,
    cancelRate: ratio(a.cancelled, a.bookings),
  }));
}

export const LEAD_BUCKETS = [
  { label: "0–1 días", max: 1 },
  { label: "2–7 días", max: 7 },
  { label: "8–30 días", max: 30 },
  { label: "31–90 días", max: 90 },
  { label: "+90 días", max: Infinity },
] as const;

/** How far ahead guests book (stays booked in the period, cancelled included). */
export function leadTimeBuckets(facts: StayFact[], from: Ymd, to: Ymd) {
  const counts = LEAD_BUCKETS.map((b) => ({ label: b.label, bookings: 0 }));
  for (const f of facts) {
    if (f.created < from || f.created > to || f.status === "rejected") continue;
    const lead = Math.max(0, nightsBetween(f.created, f.checkIn));
    counts[LEAD_BUCKETS.findIndex((b) => lead <= b.max)].bookings += 1;
  }
  return counts;
}

/** Headline numbers for a period. */
export function summarize(facts: StayFact[], rooms: number, from: Ymd, to: Ymd) {
  const days = dailyKpis(facts, rooms, from, to);
  const available = days.reduce((s, d) => s + d.available, 0);
  const sold = days.reduce((s, d) => s + d.sold, 0);
  const revenue = days.reduce((s, d) => s + d.revenue, 0);
  const { day: _day, ...totals } = withRates(from, available, sold, revenue);
  return { ...totals, ...bookingStats(facts, from, to) };
}
