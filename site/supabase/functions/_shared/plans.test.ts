import { describe, expect, it } from "vitest";
import {
  ADDON_IDS,
  ADDONS,
  PLAN_IDS,
  PLAN_PACKAGES,
  PLANS,
  downtimeMinutes,
  quote,
  slaCredit,
  suggestPlan,
} from "./plans.ts";

describe("quote", () => {
  it("charges per room with a monthly minimum", () => {
    expect(quote({ plan: "starter", rooms: 20 }).monthly).toBe(80);
    expect(quote({ plan: "starter", rooms: 5 }).monthly).toBe(PLANS.starter.minimum);
    expect(quote({ plan: "pro", rooms: 40 }).monthly).toBe(280);
    expect(quote({ plan: "group", rooms: 120, hotels: 2 }).monthly).toBe(720);
  });

  it("adds packages to Esencial and ignores the ones a plan already has", () => {
    const q = quote({ plan: "starter", rooms: 30, addons: ["ai", "data", "ai"] });
    expect(q.monthly).toBe(120 + 60 + 30);
    expect(q.packages).toEqual(["stay", "ai", "data"]);
    expect(quote({ plan: "pro", rooms: 30, addons: ["ai"] }).monthly).toBe(210);
  });

  it("applies the annual discount", () => {
    const q = quote({ plan: "pro", rooms: 40, annual: true });
    expect(q.effectiveMonthly).toBe(238);
    expect(q.yearly).toBe(2856);
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
