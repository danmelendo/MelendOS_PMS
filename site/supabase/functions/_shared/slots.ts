// Demo call slots: 30-minute video calls on weekdays, Madrid time. Pure code,
// shared by the website (to show the times) and the leads function (to accept
// only real ones). Works across daylight-saving changes.

export const DEMO_TIMEZONE = "Europe/Madrid";
/** Start of each call, local time in Madrid, Monday to Friday. */
export const DEMO_TIMES = [
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
];
export const DEMO_MINUTES = 30;
/** How far ahead a call can be booked, and the minimum notice. */
export const DEMO_DAYS_AHEAD = 21;
export const DEMO_NOTICE_HOURS = 12;

/** A calendar date, "yyyy-MM-dd". */
type Ymd = string;

function addDays(day: Ymd, n: number): Ymd {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Calendar date of an instant in a timezone. */
function ymdInZone(instant: Date, timeZone: string): Ymd {
  // en-CA formats as yyyy-MM-dd.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Offset in minutes of a timezone at an instant (e.g. +120 for CEST). */
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

/** UTC instant of a local wall-clock time on a date in a timezone. */
function zonedTimeToUtc(day: Ymd, hour: number, minute: number, timeZone: string): Date {
  const guess = new Date(
    `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
  );
  const first = new Date(guess.getTime() - offsetMinutes(guess, timeZone) * 60_000);
  // Re-check with the offset at the resulting instant (DST boundary days).
  return new Date(guess.getTime() - offsetMinutes(first, timeZone) * 60_000);
}

/**
 * Free call slots from now on (UTC ISO instants): weekdays at DEMO_TIMES in
 * Madrid, at least DEMO_NOTICE_HOURS ahead, minus the ones already taken.
 */
export function demoSlots(now: Date, taken: Iterable<string> = []): string[] {
  const busy = new Set([...taken].map((t) => new Date(t).toISOString()));
  const earliest = now.getTime() + DEMO_NOTICE_HOURS * 3_600_000;
  const today = ymdInZone(now, DEMO_TIMEZONE);
  const out: string[] = [];
  for (let i = 0; i <= DEMO_DAYS_AHEAD; i++) {
    const day = addDays(today, i);
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    for (const t of DEMO_TIMES) {
      const [h, m] = t.split(":").map(Number);
      const at = zonedTimeToUtc(day, h, m, DEMO_TIMEZONE);
      if (at.getTime() < earliest) continue;
      const iso = at.toISOString();
      if (!busy.has(iso)) out.push(iso);
    }
  }
  return out;
}

/** Madrid calendar date of a slot, to group slots by day in the picker. */
export function slotDay(iso: string): Ymd {
  return ymdInZone(new Date(iso), DEMO_TIMEZONE);
}
