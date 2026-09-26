// Room occupancy rules shared by the panel and the Edge Functions. The
// Postgres trigger `check_reservation_gap` is the real guard; this module
// mirrors it so the panel can warn before saving and so the rule can be tested.
//
// A reservation occupies its room for [start, end + cleaning). Two reservations
// of the same room conflict when those windows overlap.

export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show"
  | "rejected";

export interface RoomReservation {
  id: string;
  roomId: string;
  status: ReservationStatus;
  /** ISO instants. */
  startAt: string;
  endAt: string;
  cleaningMinutes: number;
  /** When the reservation was created (pending ones expire after a while). */
  createdAt: string;
  /** Admin override: skips the gap check. */
  manualOverride?: boolean;
}

export const MIN_CLEANING_MINUTES = 15;
/** Unpaid (pending) reservations stop holding the room after this long. */
export const PENDING_HOLD_MINUTES = 60;

const INACTIVE: ReservationStatus[] = ["cancelled", "no_show", "rejected"];

export function occupiedWindow(r: RoomReservation): [number, number] {
  const start = new Date(r.startAt).getTime();
  const end = new Date(r.endAt).getTime();
  return [start, end + Math.max(0, r.cleaningMinutes) * 60_000];
}

/** Whether an existing reservation keeps its room busy right now. */
export function isBlocking(r: RoomReservation, now: Date): boolean {
  if (r.status === "pending") {
    return new Date(r.createdAt).getTime() > now.getTime() - PENDING_HOLD_MINUTES * 60_000;
  }
  return r.status === "confirmed" || r.status === "in_progress" || r.status === "completed";
}

/**
 * The first existing reservation the candidate would overlap with, or null.
 * Inactive candidates and admin overrides never conflict.
 */
export function findConflict(
  candidate: RoomReservation,
  existing: RoomReservation[],
  now: Date,
): RoomReservation | null {
  if (INACTIVE.includes(candidate.status) || candidate.manualOverride) return null;
  const [aStart, aEnd] = occupiedWindow(candidate);
  for (const r of existing) {
    if (r.id === candidate.id || r.roomId !== candidate.roomId) continue;
    if (!isBlocking(r, now)) continue;
    const [bStart, bEnd] = occupiedWindow(r);
    if (aStart < bEnd && bStart < aEnd) return r;
  }
  return null;
}

export interface Shift {
  id: string;
  startAt: string;
  endAt: string;
}

/**
 * Extend a reservation's cleaning time and push the following reservations of
 * the same room forward, preserving their length, until a gap absorbs the
 * delay. Returns the new times of the reservations that move (in order).
 */
export function planCleaningShift(
  target: RoomReservation,
  newCleaningMinutes: number,
  existing: RoomReservation[],
): Shift[] {
  const cleaning = Math.max(MIN_CLEANING_MINUTES, newCleaningMinutes);
  const targetStart = new Date(target.startAt).getTime();
  const following = existing
    .filter(
      (r) =>
        r.roomId === target.roomId &&
        r.id !== target.id &&
        !INACTIVE.includes(r.status) &&
        new Date(r.startAt).getTime() >= targetStart,
    )
    .sort((x, y) => new Date(x.startAt).getTime() - new Date(y.startAt).getTime());

  const shifts: Shift[] = [];
  let earliest = new Date(target.endAt).getTime() + cleaning * 60_000;
  for (const r of following) {
    const start = new Date(r.startAt).getTime();
    if (start >= earliest) break; // the gap absorbs the delay
    const length = new Date(r.endAt).getTime() - start;
    shifts.push({
      id: r.id,
      startAt: new Date(earliest).toISOString(),
      endAt: new Date(earliest + length).toISOString(),
    });
    earliest = earliest + length + Math.max(0, r.cleaningMinutes) * 60_000;
  }
  return shifts;
}
