import { describe, expect, it } from "vitest";
import { tenantFeatures } from "./features.ts";
import { reviewAuthor } from "./reviews.ts";

describe("tenantFeatures", () => {
  it("gives the loyalty club to chains and large hotels only", () => {
    expect(tenantFeatures("starter", {}).loyalty).toBe(false);
    expect(tenantFeatures("pro", {}).loyalty).toBe(true);
    expect(tenantFeatures("group", null).loyalty).toBe(true);
    expect(tenantFeatures(undefined, undefined)).toEqual({
      loyalty: false,
      experiences: true,
      reviews: true,
      chat: true,
      folio: true,
    });
  });

  it("lets each hotel override a module", () => {
    expect(tenantFeatures("starter", { features: { loyalty: true } }).loyalty).toBe(true);
    expect(tenantFeatures("pro", { features: { loyalty: false, reviews: false } })).toMatchObject({
      loyalty: false,
      reviews: false,
    });
    // Only booleans count.
    expect(tenantFeatures("pro", { features: { loyalty: "no" } }).loyalty).toBe(true);
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
