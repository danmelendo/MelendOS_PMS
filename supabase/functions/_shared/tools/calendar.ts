// Price calendar: for each night of a range, the average price of one night in
// the rooms still free (of a hotel, a property or a single room), like the
// fare calendars of airlines. Null when nothing is free that night.
// Same engine as the bookings (priceStay, dynamic rules, busy windows), so the
// calendar and the final quote agree.
import { addDays, isYmd, ymdInZone, zonedHourToUtc, type Ymd } from "../domain/dates.ts";
import { priceStay } from "../domain/pricing.ts";
import { toRules, type BookingStore } from "./bookings.ts";
import type { CatalogRoom } from "./registry.ts";

export const MAX_CALENDAR_DAYS = 62;

export type CalendarStore = Pick<
  BookingStore,
  "getTenantSettings" | "getBusyWindows" | "countActiveRooms" | "getRate" | "getActiveRules"
> & {
  listRooms(tenantId: string): Promise<CatalogRoom[]>;
};

export interface CalendarQuery {
  tenantId: string;
  propertyId?: string | null;
  roomId?: string | null;
  /** Only the rooms of one room type (channel availability). */
  rateGroupId?: string | null;
  from: Ymd;
  days: number;
  guests: number;
}

export interface CalendarNight {
  date: Ymd;
  /** Average price of one night in the free rooms, rounded to euros. */
  price: number | null;
  /** Cheapest free room that night. */
  min_price: number | null;
  free_rooms: number;
}

export class CalendarError extends Error {}

export async function priceCalendar(
  store: CalendarStore,
  q: CalendarQuery,
  now = new Date(),
): Promise<{ currency: "EUR"; nights: CalendarNight[] }> {
  if (!isYmd(q.from)) throw new CalendarError("from must be yyyy-MM-dd");
  const days = Math.min(Math.max(Math.trunc(q.days) || 0, 1), MAX_CALENDAR_DAYS);
  const guests = Math.max(Math.trunc(q.guests) || 1, 1);

  const settings = await store.getTenantSettings(q.tenantId);
  const tz = settings.timezone;
  const today = ymdInZone(now, tz);
  const first = q.from < today ? today : q.from;
  const last = addDays(q.from, days); // exclusive
  if (first >= last) return { currency: "EUR", nights: [] };

  const rangeStart = zonedHourToUtc(first, settings.checkin_hour, tz);
  const rangeEnd = zonedHourToUtc(last, settings.checkout_hour, tz);
  const [rooms, busy, ruleRows, totalRooms] = await Promise.all([
    store.listRooms(q.tenantId),
    store.getBusyWindows(
      q.tenantId,
      new Date(rangeStart.getTime() - 86_400_000),
      new Date(rangeEnd.getTime() + 86_400_000),
    ),
    store.getActiveRules(q.tenantId),
    store.countActiveRooms(q.tenantId),
  ]);
  const candidates = rooms.filter(
    (r) =>
      r.active &&
      r.status !== "out_of_service" &&
      r.rate_group_id &&
      r.capacity >= guests &&
      (!q.propertyId || r.property_id === q.propertyId) &&
      (!q.roomId || r.id === q.roomId) &&
      (!q.rateGroupId || r.rate_group_id === q.rateGroupId),
  );
  const rules = toRules(ruleRows);
  const occupied = busy.map((b) => ({
    checkIn: ymdInZone(b.start_at, tz),
    checkOut: ymdInZone(b.end_at, tz),
  }));
  const rates = new Map<string, { price: number; weekend_price: number | null } | null>();
  for (const r of candidates) {
    if (!rates.has(r.rate_group_id!)) {
      rates.set(r.rate_group_id!, await store.getRate(r.rate_group_id!));
    }
  }

  const nights: CalendarNight[] = [];
  for (let d = first; d < last; d = addDays(d, 1)) {
    const start = zonedHourToUtc(d, settings.checkin_hour, tz).getTime();
    const end = zonedHourToUtc(addDays(d, 1), settings.checkout_hour, tz).getTime();
    const prices: number[] = [];
    for (const r of candidates) {
      const taken = busy.some(
        (b) =>
          b.room_id === r.id &&
          new Date(b.start_at).getTime() < end &&
          start < new Date(b.end_at).getTime(),
      );
      const rate = rates.get(r.rate_group_id!);
      if (taken || !rate || !(Number(rate.price) > 0)) continue;
      prices.push(
        priceStay({
          checkIn: d,
          checkOut: addDays(d, 1),
          rate: {
            price: Number(rate.price),
            weekendPrice: rate.weekend_price != null ? Number(rate.weekend_price) : null,
          },
          rules,
          occupied,
          totalRooms,
          extras: [],
          gifts: [],
        }).total,
      );
    }
    nights.push({
      date: d,
      price: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
      min_price: prices.length ? Math.round(Math.min(...prices)) : null,
      free_rooms: prices.length,
    });
  }
  return { currency: "EUR", nights };
}
