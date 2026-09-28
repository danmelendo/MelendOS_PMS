import { describe, expect, it } from "vitest";
import { FEATURES, MODULES, PACKAGE_IDS, tenantFeatures, tenantPackages } from "./features.ts";
import { reviewAuthor } from "./reviews.ts";

const on = (f: ReturnType<typeof tenantFeatures>) =>
  Object.entries(f)
    .filter(([, v]) => v)
    .map(([k]) => k);

describe("tenantFeatures", () => {
  it("follows the plan when the hotel has not chosen packages", () => {
    // Hostels and traditional hotels: the stay package, no club, no AI.
    expect(on(tenantFeatures("starter", {}))).toEqual(["chat", "folio", "reviews"]);
    expect(on(tenantFeatures(undefined, undefined))).toEqual(on(tenantFeatures("starter", {})));
    // Large hotels and chains: everything, loyalty club included.
    expect(on(tenantFeatures("pro", {}))).toEqual([...FEATURES]);
    expect(tenantFeatures("group", null).loyalty).toBe(true);
  });

  it("uses the packages the hotel contracted", () => {
    const f = tenantFeatures("starter", { packages: ["ai", "data", "nonsense"] });
    expect(on(f)).toEqual(["ai_agent", "mcp", "copilot", "reports", "data_lake"]);
    expect(tenantPackages("pro", { packages: [] })).toEqual([]);
    expect(on(tenantFeatures("pro", { packages: [] }))).toEqual([]);
  });

  it("lets each hotel override a single module", () => {
    expect(tenantFeatures("starter", { features: { loyalty: true } }).loyalty).toBe(true);
    expect(tenantFeatures("pro", { features: { loyalty: false, reviews: false } })).toMatchObject({
      loyalty: false,
      reviews: false,
    });
    // Only booleans count.
    expect(tenantFeatures("pro", { features: { loyalty: "no" } }).loyalty).toBe(true);
  });

  it("puts every module in one known package", () => {
    for (const f of FEATURES) expect(PACKAGE_IDS).toContain(MODULES[f].package);
  });
});

describe("reviewAuthor", () => {
  it("shows the first name and the initial of the surname", () => {
    expect(reviewAuthor("Laura Gómez Ruiz")).toBe("Laura G.");
    expect(reviewAuthor("  álvaro  martín ")).toBe("álvaro M.");
    expect(reviewAuthor("Noa")).toBe("Noa");
    expect(reviewAuthor("")).toBe("Huésped");
    expect(reviewAuthor(null)).toBe("Huésped");
  });
});
