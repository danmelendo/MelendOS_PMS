import { describe, expect, it } from "vitest";
import {
  ADDON_IDS,
  ADDONS,
  COSTS,
  SERVE_COST,
  PLAN_IDS,
  PLAN_PACKAGES,
  PLANS,
  downtimeMinutes,
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

  it("applies the annual discount", () => {
    const q = quote({ plan: "pro", rooms: 40, annual: true });
    expect(q.effectiveMonthly).toBe(306);
    expect(q.yearly).toBe(3672);
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

describe("SLA", () => {
  it("credits a share of the month below the commitment", () => {
    expect(slaCredit("group", 99.95)).toBe(0);
    expect(slaCredit("group", 99.8)).toBe(0.1);
    expect(slaCredit("starter", 99.6)).toBe(0);
    expect(slaCredit("pro", 98.5)).toBe(0.25);
    expect(slaCredit("starter", 90)).toBe(0.5);
  });

  it("gets stricter with each plan", () => {
    expect(PLANS.starter.sla.uptime).toBeLessThan(PLANS.pro.sla.uptime);
    expect(PLANS.pro.sla.uptime).toBeLessThan(PLANS.group.sla.uptime);
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
  });

  it("breaks even and reaches the target margin with a reachable number of hotels", () => {
    const e = unitEconomics();
    expect(e.breakEven).toBe(38);
    expect(e.target).toBe(48);
    expect(e.supportHours).toBeLessThanOrEqual(COSTS.supportCapacity);
  });
});
