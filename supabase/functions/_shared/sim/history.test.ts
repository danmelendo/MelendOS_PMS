import { describe, expect, it } from "vitest";
import { eachNight, nightsBetween } from "../domain/dates.ts";
import { dailyKpis, monthlyKpis, type StayFact } from "../domain/kpis.ts";
import { easter, simCustomers, simulateHistory, type SimRoom, type SimStay } from "./history.ts";

const rooms: SimRoom[] = Array.from({ length: 10 }, (_, i) => ({
  id: `r${i}`,
  tenantId: "t1",
  propertyId: "p1",
  capacity: i === 9 ? 4 : 2,
  price: 90 + i * 10,
  weekendPrice: 110 + i * 10,
}));
const base = { rooms, from: "2025-01-01", to: "2026-12-31", today: "2026-09-25", seed: 7 };

const facts = (stays: SimStay[]): StayFact[] =>
  stays.map((s) => ({
    tenantId: s.tenantId,
    roomId: s.roomId,
    checkIn: s.checkIn,
    checkOut: s.checkOut,
    created: s.createdAt.slice(0, 10),
    cancelled: s.cancelledAt?.slice(0, 10) ?? null,
    status: s.status,
    channel: s.channel,
    guests: s.guests,
    roomRevenue: s.roomRevenue,
  }));

describe("simulateHistory", () => {
  const urban = simulateHistory({ ...base, profile: "urban" });
  const coastal = simulateHistory({ ...base, profile: "coastal" });

  it("is deterministic for a seed", () => {
    expect(simulateHistory({ ...base, profile: "urban" }).stays).toEqual(urban.stays);
    expect(simulateHistory({ ...base, profile: "urban", seed: 8 }).stays).not.toEqual(urban.stays);
  });

  it("never double-books a room", () => {
    for (const { stays } of [urban, coastal]) {
      const taken = new Set<string>();
      for (const s of stays) {
        if (s.status === "cancelled" || s.status === "no_show") continue;
        for (const n of eachNight(s.checkIn, s.checkOut)) {
          const key = `${s.roomId}/${n}`;
          expect(taken.has(key), key).toBe(false);
          taken.add(key);
        }
      }
    }
  });

  it("keeps the timeline consistent with today", () => {
    for (const s of urban.stays) {
      expect(s.createdAt.slice(0, 10) <= base.today).toBe(true);
      expect(s.createdAt.slice(0, 10) <= s.checkIn).toBe(true);
      if (s.cancelledAt) {
        expect(s.status).toBe("cancelled");
        expect(s.cancelledAt >= s.createdAt).toBe(true);
        expect(s.cancelledAt.slice(0, 10) <= base.today).toBe(true);
      }
      if (s.status === "completed" || s.status === "no_show") {
        expect(s.checkOut < base.today).toBe(true);
      }
      if (s.status === "confirmed") expect(s.checkIn >= base.today).toBe(true);
      expect(rooms.find((r) => r.id === s.roomId)!.capacity >= s.guests).toBe(true);
      expect(s.roomRevenue).toBeGreaterThan(0);
    }
  });

  it("looks like a hotel: realistic occupancy, cancellations and seasonality", () => {
    const u = monthlyKpis(dailyKpis(facts(urban.stays), rooms.length, "2025-01-01", "2025-12-31"));
    const c = monthlyKpis(
      dailyKpis(facts(coastal.stays), rooms.length, "2025-01-01", "2025-12-31"),
    );
    const avg = (xs: { occupancy: number }[]) =>
      xs.reduce((s, x) => s + x.occupancy, 0) / xs.length;
    expect(avg(u)).toBeGreaterThan(0.55);
    expect(avg(u)).toBeLessThan(0.85);
    // Coastal: August far above January; urban much flatter.
    expect(c[7].occupancy - c[0].occupancy).toBeGreaterThan(0.45);
    expect(Math.abs(u[7].occupancy - u[0].occupancy)).toBeLessThan(0.3);
    // Prices follow demand.
    expect(c[7].adr).toBeGreaterThan(c[0].adr);
    const past = urban.stays.filter((s) => s.checkIn < "2026-06-01");
    const rate = past.filter((s) => s.status === "cancelled").length / past.length;
    expect(rate).toBeGreaterThan(0.06);
    expect(rate).toBeLessThan(0.25);
    // Future stays are on the books, fewer the further out.
    const ahead = (min: number, max: number) =>
      urban.stays.filter((s) => {
        const d = nightsBetween(base.today, s.checkIn);
        return s.status === "confirmed" && d >= min && d <= max;
      }).length;
    expect(ahead(0, 30)).toBeGreaterThan(ahead(61, 91));
  });

  it("respects nights already taken", () => {
    const busy = [{ roomId: "r0", checkIn: "2026-09-20", checkOut: "2026-09-30" }];
    const { stays } = simulateHistory({ ...base, profile: "urban", busy });
    const clash = stays.filter(
      (s) =>
        s.roomId === "r0" &&
        s.status !== "cancelled" &&
        s.status !== "no_show" &&
        s.checkIn < "2026-09-30" &&
        s.checkOut > "2026-09-20",
    );
    expect(clash).toEqual([]);
  });
});

describe("helpers", () => {
  it("computes Easter", () => {
    expect(easter(2025)).toBe("2025-04-20");
    expect(easter(2026)).toBe("2026-04-05");
  });
  it("makes fictitious guests with example.com emails", () => {
    const c = simCustomers(1, 50);
    expect(new Set(c.map((x) => x.email)).size).toBe(50);
    expect(c.every((x) => x.email.endsWith("@example.com"))).toBe(true);
  });
});
