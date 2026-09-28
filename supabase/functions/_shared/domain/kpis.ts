// Hotel KPIs from stay facts (the `report_stays` SQL function only projects
// the data; the maths lives here, tested).
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
import { addDays, dayOfWeek, eachNight, nightsBetween, type Ymd } from "./dates.ts";
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
  /** Why it was cancelled or rejected (@domain/cancellations.ts), if it was. */
  cancelCategory?: string | null;
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
  /** Cancellations by reason group. */
  cancelReasons: Record<string, number>;
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
  const cancelReasons: Record<string, number> = {};
  for (const f of booked) {
    if (f.status !== "cancelled") continue;
    const c = f.cancelCategory ?? "no_reason";
    cancelReasons[c] = (cancelReasons[c] ?? 0) + 1;
  }
  return {
    bookings: booked.length,
    cancelled,
    noShows: booked.filter((f) => f.status === "no_show").length,
    cancelRate: ratio(cancelled, booked.length),
    avgLeadDays: round2(ratio(lead, booked.length)),
    avgLengthOfStay: round2(ratio(los, booked.length)),
    channels,
    cancelReasons,
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

/** Rows of report_stays(): [tenant, room, check_in, check_out, created, cancelled, status, channel, guests, room_revenue]. */
export function parseStayFacts(raw: { rooms?: Record<string, number>; stays?: unknown[][] }) {
  return {
    rooms: raw.rooms ?? {},
    stays: (raw.stays ?? []).map(
      (s): StayFact => ({
        tenantId: String(s[0]),
        roomId: String(s[1]),
        checkIn: String(s[2]),
        checkOut: String(s[3]),
        created: String(s[4]),
        cancelled: s[5] == null ? null : String(s[5]),
        status: String(s[6]),
        channel: s[7] == null ? null : String(s[7]),
        guests: Number(s[8]),
        roomRevenue: Number(s[9]),
        cancelCategory: s[10] == null ? null : String(s[10]),
      }),
    ),
  };
}

/** Friday and Saturday nights are the weekend (same as the weekend rates). */
export type NightFilter = "all" | "weekday" | "weekend";
const WEEKEND_NIGHTS = new Set([5, 6]);
const keepNight = (d: Ymd, f: NightFilter) =>
  f === "all" || WEEKEND_NIGHTS.has(dayOfWeek(d)) === (f === "weekend");

export interface RoomKpi {
  roomId: string;
  nights: number;
  sold: number;
  revenue: number;
  occupancy: number;
  adr: number;
}

/** Sold nights, occupancy and revenue per room over [from, to], least booked first. */
export function roomPerformance(
  facts: StayFact[],
  roomIds: string[],
  from: Ymd,
  to: Ymd,
  filter: NightFilter = "all",
): RoomKpi[] {
  const days = daysIn(from, to).filter((d) => keepNight(d, filter));
  const inRange = new Set(days);
  const acc = new Map(roomIds.map((id) => [id, { sold: 0, revenue: 0 }]));
  for (const f of facts) {
    const room = acc.get(f.roomId);
    if (!room || !isSold(f)) continue;
    const nights = eachNight(f.checkIn, f.checkOut);
    for (const d of nights) {
      if (!inRange.has(d)) continue;
      room.sold += 1;
      room.revenue += f.roomRevenue / nights.length;
    }
  }
  return [...acc]
    .map(([roomId, a]) => ({
      roomId,
      nights: days.length,
      sold: a.sold,
      revenue: round2(a.revenue),
      occupancy: ratio(a.sold, days.length),
      adr: round2(ratio(a.revenue, a.sold)),
    }))
    .sort((a, b) => a.occupancy - b.occupancy || a.revenue - b.revenue);
}

export const WEEKDAY_NAMES = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
] as const;

/** Occupancy and ADR by night of the week (Monday first). */
export function weekdayKpis(facts: StayFact[], rooms: number, from: Ymd, to: Ymd) {
  const byDow = new Map<number, { available: number; sold: number; revenue: number }>();
  for (const d of dailyKpis(facts, rooms, from, to)) {
    const dow = dayOfWeek(d.day);
    const a = byDow.get(dow) ?? { available: 0, sold: 0, revenue: 0 };
    a.available += d.available;
    a.sold += d.sold;
    a.revenue += d.revenue;
    byDow.set(dow, a);
  }
  return [1, 2, 3, 4, 5, 6, 0]
    .filter((dow) => byDow.has(dow))
    .map((dow) => {
      const a = byDow.get(dow)!;
      const { day: _day, ...rest } = withRates(from, a.available, a.sold, a.revenue);
      return { night: WEEKDAY_NAMES[dow], ...rest };
    });
}

/** Who made the booking (reservations.created_by_role), for people. */
export const CHANNEL_LABELS: Record<string, string> = {
  public: "Web directa",
  admin: "Recepción / teléfono",
  staff: "Recepción / teléfono",
  reception: "Recepción / teléfono",
  agent: "Asistente IA",
  mcp: "Integración IA (MCP)",
  ota: "OTAs",
  tour_operator: "Touroperadores",
  member: "Club (app)",
  import: "Importadas del sistema anterior",
  other: "Otros",
};
