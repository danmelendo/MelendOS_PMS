import { describe, expect, it } from "vitest";
import { priceStay, type PriceStayInput } from "./pricing.ts";

// 2026-10-01 is a Thursday, so a stay from the 1st to the 4th covers a Thursday,
// a Friday and a Saturday night.
const base: PriceStayInput = {
  checkIn: "2026-10-01",
  checkOut: "2026-10-04",
  rate: { price: 100, weekendPrice: 130 },
  rules: [],
  occupied: [],
  totalRooms: 10,
  extras: [],
  gifts: [],
};

describe("priceStay: base price", () => {
  it("uses the weekend price on Friday and Saturday nights", () => {
    const r = priceStay(base);
    expect(r.base).toBe(100 + 130 + 130);
    expect(r.total).toBe(360);
    expect(r.dynamicReason).toBeNull();
  });

  it("falls back to the weekday price when there is no weekend price", () => {
    const r = priceStay({ ...base, rate: { price: 100, weekendPrice: null } });
    expect(r.base).toBe(300);
  });

  it("does not charge the departure day", () => {
    const r = priceStay({ ...base, checkIn: "2026-10-05", checkOut: "2026-10-06" });
    expect(r.base).toBe(100); // Monday night only
  });

  it("prices zero nights as zero", () => {
    const r = priceStay({ ...base, checkOut: base.checkIn });
    expect(r.base).toBe(0);
    expect(r.total).toBe(0);
  });

  it("crosses month and year boundaries", () => {
    const r = priceStay({ ...base, checkIn: "2026-12-31", checkOut: "2027-01-02" });
    // Thu 31 Dec and Fri 1 Jan
    expect(r.base).toBe(100 + 130);
  });
});

describe("priceStay: date rules", () => {
  it("surcharges only the nights inside the range", () => {
    const r = priceStay({
      ...base,
      rules: [
        {
          name: "Temporada alta",
          type: "date",
          multiplier: 20,
          from: "2026-10-02",
          to: "2026-10-02",
        },
      ],
    });
    expect(r.dynamicSurcharge).toBe(26); // 20 % of the Friday night (130)
    expect(r.dynamicReason).toBe("Temporada alta (+20%)");
  });

  it("stacks overlapping date rules", () => {
    const r = priceStay({
      ...base,
      rules: [
        { name: "A", type: "date", multiplier: 10, from: "2026-10-01", to: "2026-10-03" },
        { name: "B", type: "date", multiplier: 5, from: "2026-10-01", to: "2026-10-01" },
      ],
    });
    expect(r.dynamicSurcharge).toBe(36 + 5); // 10 % of 360 + 5 % of 100
    expect(r.dynamicReason).toBe("A (+10%) · B (+5%)");
  });
});

describe("priceStay: occupancy rules", () => {
  const rules: PriceStayInput["rules"] = [
    { name: "Media", type: "occupancy", multiplier: 10, threshold: 50 },
    { name: "Alta", type: "occupancy", multiplier: 25, threshold: 80 },
  ];

  it("applies only the highest threshold reached, per night", () => {
    // Thursday: 8/10 busy (Alta). Friday: 5/10 (Media). Saturday: 1/10 (none).
    const occupied = [
      ...Array.from({ length: 4 }, () => ({ checkIn: "2026-10-01", checkOut: "2026-10-03" })),
      ...Array.from({ length: 4 }, () => ({ checkIn: "2026-10-01", checkOut: "2026-10-02" })),
      { checkIn: "2026-10-02", checkOut: "2026-10-04" },
    ];
    const r = priceStay({ ...base, rules, occupied });
    expect(r.dynamicSurcharge).toBe(25 + 13); // 25 % of 100 + 10 % of 130
    expect(r.dynamicReason).toBe("Ocupación ≥ 80% (+25%) · Ocupación ≥ 50% (+10%)");
  });

  it("treats a stay as occupying its nights, not its departure day", () => {
    const occupied = Array.from({ length: 9 }, () => ({
      checkIn: "2026-09-28",
      checkOut: "2026-10-01",
    }));
    const r = priceStay({ ...base, rules, occupied });
    expect(r.dynamicSurcharge).toBe(0);
  });

  it("never divides by zero rooms", () => {
    const r = priceStay({ ...base, rules, totalRooms: 0 });
    expect(Number.isFinite(r.total)).toBe(true);
  });
});

describe("priceStay: extras and gifts", () => {
  it("adds extras on top and marks gifts whose threshold is reached", () => {
    const r = priceStay({
      ...base,
      extras: [
        { extraId: "breakfast", qty: 4, price: 18 },
        { extraId: "spa", qty: 1, price: 30 },
      ],
      gifts: [
        { minExtrasTotal: 80, giftExtraId: "late-checkout" },
        { minExtrasTotal: 200, giftExtraId: "welcome" },
      ],
    });
    expect(r.extrasTotal).toBe(102);
    expect(r.total).toBe(462);
    expect(r.giftedExtraIds).toEqual(["late-checkout"]);
  });

  it("rounds to cents", () => {
    const r = priceStay({
      ...base,
      rate: { price: 99.99, weekendPrice: null },
      rules: [{ name: "X", type: "date", multiplier: 7, from: "2026-10-01", to: "2026-10-03" }],
    });
    expect(r.base).toBe(299.97);
    expect(r.dynamicSurcharge).toBe(21);
  });
});
