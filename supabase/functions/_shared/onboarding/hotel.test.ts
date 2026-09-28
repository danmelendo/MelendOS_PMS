import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hotelSettings, hotelSpec, specProblems } from "./hotel.ts";

const example = JSON.parse(readFileSync("scripts/hotel.example.json", "utf8"));

describe("hotel file for onboarding", () => {
  it("accepts the example and turns it into the hotel's settings", () => {
    expect(specProblems(example)).toEqual([]);
    expect(hotelSettings(hotelSpec.parse(example))).toEqual({
      checkin_hour: 14,
      checkout_hour: 11,
      currency: "EUR",
      timezone: "Europe/Madrid",
      payment: { modes: ["at_hotel", "prepay"], default: "at_hotel" },
      cancellation: { free_hours: 24, penalty: "first_night" },
      packages: [],
    });
  });

  it("explains every problem before touching the database", () => {
    const bad = structuredClone(example);
    bad.slug = "Hostal Ejemplo";
    bad.rates.push({ name: "Doble", price: 10 });
    bad.properties[0].rooms[1].name = "1";
    bad.properties[0].rooms[2].rate = "Suite";
    bad.reception = ["direccion@hostal-ejemplo.example"];
    bad.timezone = "Europa/Madrid";
    const problems = specProblems(bad).join("\n");
    expect(problems).toContain("slug");
    expect(problems).toContain("tarifa repetida: Doble");
    expect(problems).toContain("habitación repetida en Hostal Ejemplo: 1");
    expect(problems).toContain("tarifa que no existe: Suite");
    expect(problems).toContain("un email está repetido");
    expect(problems).toContain("zona horaria no válida");
  });

  it("uses the plan's defaults when the file does not say", () => {
    const minimal = hotelSpec.parse({
      slug: "hotel-minimo",
      name: "Hotel Mínimo",
      admins: ["a@b.example"],
      rates: [{ name: "Doble", price: 80 }],
      properties: [
        {
          name: "Hotel Mínimo",
          city: "Sevilla",
          rooms: [{ name: "101", capacity: 2, rate: "Doble" }],
        },
      ],
    });
    expect(minimal).toMatchObject({
      plan: "starter",
      status: "trial",
      payment_modes: ["prepay", "at_hotel"],
    });
    expect(hotelSettings(minimal)).not.toHaveProperty("packages");
  });
});
