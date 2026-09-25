import { describe, expect, it } from "vitest";
import {
  bookingStats,
  bookingsByMonth,
  dailyKpis,
  leadTimeBuckets,
  monthlyKpis,
  summarize,
  type StayFact,
} from "./kpis.ts";

const fact = (over: Partial<StayFact>): StayFact => ({
  tenantId: "t1",
  roomId: "r1",
  checkIn: "2026-03-01",
  checkOut: "2026-03-03",
  created: "2026-02-01",
  cancelled: null,
  status: "completed",
  channel: "public",
  guests: 2,
  roomRevenue: 200,
  ...over,
});

describe("dailyKpis", () => {
  it("spreads room revenue over the nights and ignores unsold stays", () => {
    const facts = [
      fact({}),
      fact({ roomId: "r2", checkIn: "2026-03-02", checkOut: "2026-03-03", roomRevenue: 150 }),
      fact({ roomId: "r3", status: "cancelled", cancelled: "2026-02-10" }),
      fact({ roomId: "r4", status: "pending" }),
      fact({ roomId: "r5", status: "no_show" }),
    ];
    const days = dailyKpis(facts, 4, "2026-03-01", "2026-03-03");
    expect(days.map((d) => d.sold)).toEqual([1, 2, 0]); // departure night not slept
    expect(days[1]).toMatchObject({
      available: 4,
      sold: 2,
      revenue: 250,
      occupancy: 0.5,
      adr: 125,
      revpar: 62.5,
    });
    expect(days[2]).toMatchObject({ occupancy: 0, adr: 0, revpar: 0 });
  });

  it("only counts the nights inside the period", () => {
    const days = dailyKpis(
      [fact({ checkIn: "2026-02-27", checkOut: "2026-03-02", roomRevenue: 300 })],
      1,
      "2026-03-01",
      "2026-03-31",
    );
    expect(days).toHaveLength(31);
    expect(days[0]).toMatchObject({ sold: 1, revenue: 100 });
    expect(days[1].sold).toBe(0);
  });

  it("groups by month", () => {
    const facts = [fact({ checkIn: "2026-03-31", checkOut: "2026-04-02", roomRevenue: 180 })];
    const months = monthlyKpis(dailyKpis(facts, 2, "2026-03-01", "2026-04-30"));
    expect(months.map((m) => m.month)).toEqual(["2026-03", "2026-04"]);
    expect(months[0]).toMatchObject({ available: 62, sold: 1, revenue: 90, adr: 90 });
    expect(months[1].occupancy).toBeCloseTo(1 / 60);
  });
});

describe("booking metrics", () => {
  const facts = [
    fact({ created: "2026-02-01", checkIn: "2026-03-01" }), // 28 days ahead
    fact({
      created: "2026-02-10",
      checkIn: "2026-02-10",
      checkOut: "2026-02-11",
      channel: "admin",
    }), // same day
    fact({
      created: "2026-02-15",
      checkIn: "2026-06-01",
      checkOut: "2026-06-05",
      status: "cancelled",
      cancelled: "2026-03-01",
    }),
    fact({ created: "2026-01-15" }), // booked before the period
    fact({ created: "2026-02-20", status: "rejected" }),
  ];

  it("summarises stays booked in the period", () => {
    const s = bookingStats(facts, "2026-02-01", "2026-02-28");
    expect(s).toMatchObject({
      bookings: 3,
      cancelled: 1,
      noShows: 0,
      channels: { public: 2, admin: 1 },
    });
    expect(s.cancelRate).toBeCloseTo(1 / 3);
    expect(s.avgLeadDays).toBeCloseTo((28 + 0 + 106) / 3, 1);
    expect(s.avgLengthOfStay).toBeCloseTo((2 + 1 + 4) / 3, 1);
  });

  it("buckets lead times and counts bookings per month", () => {
    expect(leadTimeBuckets(facts, "2026-02-01", "2026-02-28").map((b) => b.bookings)).toEqual([
      1, 0, 1, 0, 1,
    ]);
    expect(bookingsByMonth(facts, "2026-01-01", "2026-02-28")).toEqual([
      { month: "2026-01", bookings: 1, cancelled: 0, cancelRate: 0 },
      { month: "2026-02", bookings: 3, cancelled: 1, cancelRate: 1 / 3 },
    ]);
  });

  it("gives headline numbers for a period", () => {
    const s = summarize(facts, 2, "2026-03-01", "2026-03-02");
    expect(s).toMatchObject({
      available: 4,
      sold: 4,
      revenue: 400,
      occupancy: 1,
      adr: 100,
      revpar: 100,
      bookings: 0,
    });
    expect(s).not.toHaveProperty("day");
  });
});
