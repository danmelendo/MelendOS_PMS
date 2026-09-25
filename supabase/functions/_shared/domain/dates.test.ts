import { describe, expect, it } from "vitest";
import { addDays, dayOfWeek, eachNight, isYmd, nightsBetween } from "./dates.ts";

describe("dates", () => {
  it("validates calendar dates", () => {
    expect(isYmd("2026-02-28")).toBe(true);
    expect(isYmd("2026-02-30")).toBe(false);
    expect(isYmd("2026-2-3")).toBe(false);
  });

  it("counts nights and lists them, excluding the departure day", () => {
    expect(nightsBetween("2026-10-01", "2026-10-04")).toBe(3);
    expect(eachNight("2026-10-01", "2026-10-04")).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(eachNight("2026-10-04", "2026-10-01")).toEqual([]);
  });

  it("is not affected by daylight-saving changes", () => {
    // Spain moves clocks back on 25 Oct 2026.
    expect(nightsBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
  });

  it("knows the day of the week", () => {
    expect(dayOfWeek("2026-10-02")).toBe(5); // Friday
  });

  it("rejects invalid input", () => {
    expect(() => nightsBetween("2026-13-01", "2026-10-01")).toThrow();
  });
});
