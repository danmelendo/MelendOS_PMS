import { describe, expect, it } from "vitest";
import {
  ADDON_IDS,
  ADDONS,
  COSTS,
  SERVE_COST,
  SLA_IDS,
  SLA_SERVE_COST,
  SLA_TIERS,
  PLAN_IDS,
  PLAN_PACKAGES,
  PLANS,
  downtimeMinutes,
  listPrice,
  quote,
  slaCredit,
  suggestPlan,
  unitEconomics,
} from "./plans.ts";

describe("quote", () => {
  it("charges per room with a monthly minimum", () => {
    expect(quote({ plan: "starter", rooms: 20 }).monthly).toBe(80);
    expect(quote({ plan: "starter", rooms: 5 }).monthly).toBe(PLANS.starter.minimum);
    expect(quote({ plan: "pro", rooms: 40 }).monthly).toBe(360);
    expect(quote({ plan: "group", rooms: 120, hotels: 2 }).monthly).toBe(960);
  });

  it("adds packages to Esencial and ignores the ones a plan already has", () => {
    const q = quote({ plan: "starter", rooms: 30, addons: ["ai", "data", "ai"] });
    expect(q.monthly).toBe(120 + 90 + 30);
    expect(q.packages).toEqual(["stay", "ai", "data"]);
    expect(quote({ plan: "pro", rooms: 30, addons: ["ai"] }).monthly).toBe(270);
  });

  it("applies the annual discount, bigger for founder hotels", () => {
    const q = quote({ plan: "pro", rooms: 40, annual: true });
    expect(q.discount).toBe(0.05);
    expect(q.effectiveMonthly).toBe(342);
    expect(q.yearly).toBe(4104);
    expect(quote({ plan: "pro", rooms: 40, annual: true, founder: true }).effectiveMonthly).toBe(
      324,
    );
    // Founders get their discount only when paying annually.
    expect(quote({ plan: "pro", rooms: 40, founder: true }).effectiveMonthly).toBe(360);
  });

  it("waives Esencial onboarding only when paying a year upfront", () => {
    expect(quote({ plan: "starter", rooms: 10 }).onboarding).toBe(149);
    expect(quote({ plan: "starter", rooms: 10, annual: true }).onboarding).toBe(0);
    expect(quote({ plan: "pro", rooms: 10, annual: true }).onboarding).toBe(490);
  });

  it("rejects nonsense and a group plan for a single hotel", () => {
    expect(() => quote({ plan: "starter", rooms: 0 })).toThrow();
    expect(() => quote({ plan: "starter", rooms: 2.5 })).toThrow();
    expect(() => quote({ plan: "group", rooms: 50, hotels: 1 })).toThrow();
  });

  it("sells exactly what the server switches on", () => {
    for (const plan of PLAN_IDS)
      expect(quote({ plan, rooms: 10, hotels: PLANS[plan].minHotels }).packages).toEqual(
        PLAN_PACKAGES[plan],
      );
    for (const id of ADDON_IDS) expect(ADDONS[id]).toBeDefined();
  });
});

describe("suggestPlan", () => {
  it("moves to Profesional when Esencial plus add-ons costs more", () => {
    expect(suggestPlan(20, 1, [])).toBe("starter");
    expect(suggestPlan(20, 1, ["ai", "data", "distribution"])).toBe("pro");
    expect(suggestPlan(20, 3, [])).toBe("group");
  });
});

describe("SLA (separate service, priced by urgency)", () => {
  it("costs a share of the subscription with a minimum", () => {
    expect(quote({ plan: "starter", rooms: 20, sla: "priority" }).monthly).toBe(80 + 29);
    expect(quote({ plan: "pro", rooms: 40, sla: "urgent" }).monthly).toBe(360 + 89);
    expect(quote({ plan: "pro", rooms: 100, sla: "urgent" }).monthly).toBe(900 + 180);
    expect(quote({ plan: "group", rooms: 120, hotels: 2, sla: "always" }).monthly).toBe(960 + 390);
    // The share is taken over the plan plus its packages.
    expect(quote({ plan: "starter", rooms: 100, addons: ["ai"], sla: "priority" }).monthly).toBe(
      400 + 300 + 70,
    );
  });

  it("shows plan prices with the SLA and discount already included", () => {
    expect(listPrice("starter")).toMatchObject({ perRoom: 4, minimum: 69 });
    const urgent = listPrice("pro", { sla: "urgent" });
    expect(urgent.perRoom).toBe(10.8);
    expect(urgent.minimum).toBe(149 + 89);
    expect(urgent.addonPerRoom("ai")).toBe(3.6);
    const always = listPrice("group", { sla: "always", annual: true });
    expect(always.perRoom).toBe(9.88);
    expect(always.minimum).toBe(836);
    // Above the minimums, the card price times the rooms is what the quote charges.
    expect(listPrice("pro", { sla: "urgent" }).perRoom * 100).toBe(
      quote({ plan: "pro", rooms: 100, sla: "urgent" }).monthly,
    );
  });

  it("credits a share of the month below the commitment, and nothing without SLA", () => {
    expect(slaCredit(null, 90)).toBe(0);
    expect(slaCredit("always", 99.95)).toBe(0);
    expect(slaCredit("always", 99.8)).toBe(0.1);
    expect(slaCredit("priority", 99.6)).toBe(0);
    expect(slaCredit("urgent", 98.5)).toBe(0.25);
    expect(slaCredit("priority", 90)).toBe(0.5);
  });

  it("gets stricter and dearer with urgency", () => {
    const [a, b, c] = SLA_IDS.map((id) => SLA_TIERS[id]);
    expect(a.uptime).toBeLessThan(b.uptime);
    expect(b.uptime).toBeLessThan(c.uptime);
    expect(a.minimum).toBeLessThan(b.minimum);
    expect(b.minimum).toBeLessThan(c.minimum);
    expect(downtimeMinutes(99.9)).toBe(43);
    expect(downtimeMinutes(99.5)).toBe(216);
  });
});

describe("unit economics (two people full time)", () => {
  it("every plan's minimum pays for serving it with room to spare", () => {
    for (const id of PLAN_IDS) {
      const cost = SERVE_COST[id].hours * COSTS.hourly + SERVE_COST[id].variable;
      expect(PLANS[id].minimum, id).toBeGreaterThanOrEqual(cost * 1.5);
    }
    for (const id of SLA_IDS) {
      const cost = SLA_SERVE_COST[id].hours * COSTS.hourly + SLA_SERVE_COST[id].variable;
      expect(SLA_TIERS[id].minimum, id).toBeGreaterThanOrEqual(cost * 1.5);
    }
  });

  it("breaks even and reaches the target margin with a reachable number of hotels", () => {
    const e = unitEconomics();
    expect(e.breakEven).toBe(38);
    expect(e.target).toBe(47);
    expect(e.supportHours).toBeLessThanOrEqual(COSTS.supportCapacity);
  });
});
