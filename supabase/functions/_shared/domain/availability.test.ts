import { describe, expect, it } from "vitest";
import {
  findConflict,
  isBlocking,
  planCleaningShift,
  type RoomReservation,
} from "./availability.ts";

const NOW = new Date("2026-10-01T09:00:00Z");

function res(over: Partial<RoomReservation> & { id: string }): RoomReservation {
  return {
    roomId: "room-1",
    status: "confirmed",
    startAt: "2026-10-01T15:00:00Z",
    endAt: "2026-10-03T12:00:00Z",
    cleaningMinutes: 60,
    createdAt: "2026-09-20T10:00:00Z",
    ...over,
  };
}

describe("findConflict", () => {
  const existing = [res({ id: "a" })]; // busy until 03 Oct 13:00 (12:00 + 60 min cleaning)

  it("rejects a stay that starts during the cleaning window", () => {
    const c = res({ id: "b", startAt: "2026-10-03T12:30:00Z", endAt: "2026-10-04T12:00:00Z" });
    expect(findConflict(c, existing, NOW)?.id).toBe("a");
  });

  it("accepts a back-to-back stay once cleaning has finished", () => {
    const c = res({ id: "b", startAt: "2026-10-03T15:00:00Z", endAt: "2026-10-04T12:00:00Z" });
    expect(findConflict(c, existing, NOW)).toBeNull();
  });

  it("ignores other rooms and the reservation itself", () => {
    expect(findConflict(res({ id: "b", roomId: "room-2" }), existing, NOW)).toBeNull();
    expect(findConflict(res({ id: "a" }), existing, NOW)).toBeNull();
  });

  it("never blocks with cancelled, no-show or rejected reservations", () => {
    for (const status of ["cancelled", "no_show", "rejected"] as const) {
      expect(findConflict(res({ id: "b" }), [res({ id: "a", status })], NOW)).toBeNull();
    }
  });

  it("skips the check for admin overrides and inactive candidates", () => {
    expect(findConflict(res({ id: "b", manualOverride: true }), existing, NOW)).toBeNull();
    expect(findConflict(res({ id: "b", status: "cancelled" }), existing, NOW)).toBeNull();
  });
});

describe("isBlocking: pending holds", () => {
  it("blocks while the unpaid hold is recent and frees the room after an hour", () => {
    const fresh = res({ id: "p", status: "pending", createdAt: "2026-10-01T08:30:00Z" });
    const stale = res({ id: "p", status: "pending", createdAt: "2026-10-01T07:30:00Z" });
    expect(isBlocking(fresh, NOW)).toBe(true);
    expect(isBlocking(stale, NOW)).toBe(false);
  });
});

describe("planCleaningShift", () => {
  const target = res({
    id: "t",
    startAt: "2026-10-01T15:00:00Z",
    endAt: "2026-10-02T12:00:00Z",
    cleaningMinutes: 15,
  });

  it("pushes the next stays forward in cascade, keeping their length", () => {
    const next1 = res({
      id: "n1",
      startAt: "2026-10-02T12:30:00Z",
      endAt: "2026-10-02T14:30:00Z",
      cleaningMinutes: 15,
    });
    const next2 = res({
      id: "n2",
      startAt: "2026-10-02T14:45:00Z",
      endAt: "2026-10-02T16:45:00Z",
      cleaningMinutes: 15,
    });
    const shifts = planCleaningShift(target, 120, [target, next1, next2]);
    expect(shifts).toEqual([
      { id: "n1", startAt: "2026-10-02T14:00:00.000Z", endAt: "2026-10-02T16:00:00.000Z" },
      { id: "n2", startAt: "2026-10-02T16:15:00.000Z", endAt: "2026-10-02T18:15:00.000Z" },
    ]);
  });

  it("stops as soon as a gap absorbs the delay", () => {
    const later = res({ id: "n1", startAt: "2026-10-02T15:00:00Z", endAt: "2026-10-03T12:00:00Z" });
    expect(planCleaningShift(target, 120, [target, later])).toEqual([]);
  });

  it("never goes below the minimum cleaning time and ignores cancelled stays", () => {
    const cancelled = res({ id: "c", status: "cancelled", startAt: "2026-10-02T12:05:00Z" });
    expect(planCleaningShift(target, 5, [target, cancelled])).toEqual([]);
  });
});
