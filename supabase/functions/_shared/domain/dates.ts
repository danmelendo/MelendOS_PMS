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
