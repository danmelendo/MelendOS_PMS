import { describe, expect, it } from "vitest";
import { brandCopy, brandOf, hexToHsl, hostHotel } from "./hotel-web";

describe("hostHotel", () => {
  it("finds the hotel by its own domain, by platform subdomain or not at all (demo)", () => {
    expect(hostHotel("reservas.suhotel.com", "reservas.melendo.app")).toEqual({
      domain: "reservas.suhotel.com",
    });
    expect(hostHotel("hotel-lumen.reservas.melendo.app", "reservas.melendo.app")).toEqual({
      slug: "hotel-lumen",
    });
    expect(hostHotel("Hotel-Lumen.Reservas.Melendo.app", "reservas.melendo.app")).toEqual({
      slug: "hotel-lumen",
    });
    expect(hostHotel("reservas.melendo.app", "reservas.melendo.app")).toBeNull();
    expect(hostHotel("localhost", "reservas.melendo.app")).toBeNull();
    expect(hostHotel("127.0.0.1", "")).toBeNull();
    expect(hostHotel("albora-hotel-spa.localhost", "")).toEqual({ slug: "albora-hotel-spa" });
  });
});

describe("brandOf", () => {
  it("builds the brand from the tenant row, with defaults for what is missing", () => {
    const b = brandOf({
      id: "t1",
      slug: "hostal-sol",
      name: "Hostal Sol",
      domain: null,
      brand: { accent: "#0F6E8C", tagline: "En el centro", gallery: ["https://x/1.jpg", 3] },
      settings: { website_url: "https://hostalsol.es" },
    });
    expect(b).toMatchObject({
      id: "hostal-sol",
      tenantId: "t1",
      name: "Hostal Sol",
      short: "Hostal Sol",
      heroTitle: "Hostal Sol",
      tagline: "En el centro",
      heroAccent: hexToHsl("#0F6E8C"),
      unitWord: "habitación",
      gallery: ["https://x/1.jpg"],
      websiteUrl: "https://hostalsol.es",
      logoUrl: null,
    });
  });

  it("derives the hero hue from the colour", () => {
    expect(hexToHsl("#1F3A5F")).toBe("215 51% 25%");
    expect(hexToHsl("#ffffff")).toBe("0 0% 100%");
    expect(hexToHsl("nope")).toBe("214 51% 25%");
  });
});

describe("brandCopy", () => {
  it("gives the hotel's English texts to English guests, and the Spanish ones otherwise", () => {
    const brand = brandOf({
      id: "t1",
      slug: "hotel-sol",
      name: "Hotel Sol",
      domain: null,
      settings: null,
      brand: {
        heroTitle: "Duerme en el centro",
        about: "Somos un hotel familiar",
        heroTitle_en: "Sleep in the centre",
      },
    });
    expect(brandCopy(brand, "en")).toMatchObject({
      heroTitle: "Sleep in the centre",
      about: "Somos un hotel familiar",
    });
    expect(brandCopy(brand, "es").heroTitle).toBe("Duerme en el centro");
  });
});
