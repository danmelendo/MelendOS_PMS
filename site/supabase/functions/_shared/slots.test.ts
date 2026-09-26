import { describe, expect, it } from "vitest";
import { demoSlots, slotDay } from "./slots.ts";

describe("demoSlots", () => {
  // Friday 25 September 2026, 09:00 in Madrid (CEST, UTC+2).
  const now = new Date("2026-09-25T07:00:00Z");

  it("offers weekday slots in Madrid time with notice", () => {
    const slots = demoSlots(now);
    // 12 h of notice leave nothing on Friday: first slot Monday 10:00 (08:00 UTC).
    expect(slots[0]).toBe("2026-09-28T08:00:00.000Z");
    // No weekend.
    expect(slots.some((s) => s.startsWith("2026-09-26") || s.startsWith("2026-09-27"))).toBe(false);
    expect(slots).toContain("2026-09-28T08:00:00.000Z");
  });

  it("follows the change to winter time", () => {
    // Monday 26 October 2026: CET, UTC+1.
    const slots = demoSlots(new Date("2026-10-20T07:00:00Z"));
    expect(slots).toContain("2026-10-26T09:00:00.000Z");
    expect(slots).toContain("2026-10-23T08:00:00.000Z");
  });

  it("drops taken slots", () => {
    expect(demoSlots(now, ["2026-09-28T08:00:00Z"])).not.toContain("2026-09-28T08:00:00.000Z");
  });

  it("groups slots by Madrid date", () => {
    expect(slotDay("2026-09-28T22:30:00Z")).toBe("2026-09-29");
  });
});
