// Calendar-date helpers for nightly stays. A stay is described by the dates of
// its nights ("yyyy-MM-dd"), never by instants, so pricing gives the same answer
// in the browser and in a UTC server. All arithmetic runs on UTC midnights.

/** A calendar date, "yyyy-MM-dd". */
export type Ymd = string;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(value: string): value is Ymd {
  if (!YMD.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUtc(day: Ymd): Date {
  if (!isYmd(day)) throw new Error(`Invalid date: ${day}`);
  return new Date(`${day}T00:00:00Z`);
}

export function addDays(day: Ymd, n: number): Ymd {
  const d = toUtc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Nights between check-in and check-out (the departure day is not slept). */
export function nightsBetween(checkIn: Ymd, checkOut: Ymd): number {
  return Math.round((toUtc(checkOut).getTime() - toUtc(checkIn).getTime()) / 86_400_000);
}

/** The dates of each night of a stay: checkIn, checkIn+1, …, checkOut-1. */
export function eachNight(checkIn: Ymd, checkOut: Ymd): Ymd[] {
  const n = nightsBetween(checkIn, checkOut);
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDays(checkIn, i));
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(day: Ymd): number {
  return toUtc(day).getUTCDay();
}

/** Local calendar date of an instant, as the hotel (browser) sees it. */
export function localYmd(d: Date): Ymd {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Offset in minutes of a timezone at a given instant (e.g. +120 for CEST). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * The UTC instant of a local wall-clock hour on a calendar date in a timezone,
 * e.g. check-in at 15:00 in Europe/Madrid. Works across DST changes.
 */
export function zonedHourToUtc(day: Ymd, hour: number, timeZone: string): Date {
  const guess = new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`);
  const first = new Date(guess.getTime() - offsetMinutes(guess, timeZone) * 60_000);
  // Re-check with the offset at the resulting instant (DST boundary days).
  return new Date(guess.getTime() - offsetMinutes(first, timeZone) * 60_000);
}

/** Calendar date of an instant in a timezone (same as `(ts at time zone tz)::date`). */
export function ymdInZone(instant: Date | string, timeZone: string): Ymd {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  // en-CA formats as yyyy-MM-dd.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
