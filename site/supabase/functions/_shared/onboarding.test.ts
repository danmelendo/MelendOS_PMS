import { describe, expect, it } from "vitest";
import { cleanOnboardingData, fileContentType, onboardingProblems } from "./onboarding.ts";

const complete = {
  establishment: {
    trade_name: " Hostal Sol ",
    kind: "hostal",
    rooms: "12",
    address: "Calle Mayor 1",
    postal_code: "28001",
    city: "Madrid",
    province: "Madrid",
    phone: "+34 910 000 000",
    email: "reservas@hostalsol.example",
    checkin_hour: 14,
    checkout_hour: "11",
  },
  fiscal: {
    legal_name: "Sol SL",
    tax_id: "B00000000",
    fiscal_address: "Calle Mayor 1",
    invoicing: "yes",
  },
  brand: { accent: "#7a4b2a", email_header: "logo" },
  domain: { wants_domain: "later" },
  policies: {
    payment_modes: ["prepay", "at_hotel"],
    free_cancellation_hours: 48,
    penalty: "first_night",
  },
  team: { admins: "Direccion@HostalSol.example\ngerente@hostalsol.example" },
  compliance: { ses_registered: "no" },
};

describe("cleanOnboardingData", () => {
  it("keeps known fields, trimmed and typed", () => {
    const d = cleanOnboardingData({ ...complete, unknown: { x: 1 }, extra: { notes: "  hola " } });
    expect(d.establishment.trade_name).toBe("Hostal Sol");
    expect(d.establishment.rooms).toBe(12);
    expect(d.establishment.checkout_hour).toBe(11);
    expect(d.team.admins).toEqual(["direccion@hostalsol.example", "gerente@hostalsol.example"]);
    expect(d.extra.notes).toBe("hola");
    expect((d as Record<string, unknown>).unknown).toBeUndefined();
  });

  it("drops values out of range or not among the options", () => {
    const d = cleanOnboardingData({
      establishment: { rooms: 0, checkin_hour: 25, kind: "castle" },
      brand: { accent: "red" },
      policies: { payment_modes: ["prepay", "cash"] },
    });
    expect(d.establishment).toEqual({});
    expect(d.brand).toEqual({});
    expect(d.policies.payment_modes).toEqual(["prepay"]);
  });
});

describe("onboardingProblems", () => {
  it("accepts a complete form with the rooms file", () => {
    expect(onboardingProblems(cleanOnboardingData(complete), ["rooms"])).toEqual([]);
  });

  it("lists what is missing, including the rooms file", () => {
    const p = onboardingProblems(cleanOnboardingData({}), []);
    expect(p).toContain("Tu alojamiento: falta «Nombre comercial»");
    expect(p).toContain("Archivos: falta «Habitaciones y tarifas»");
  });

  it("asks for the domain only when they want their own", () => {
    const data = cleanOnboardingData({ ...complete, domain: { wants_domain: "yes" } });
    expect(onboardingProblems(data, ["rooms"])).toEqual([
      "Web y dominio: falta «Dirección que quieres»",
    ]);
  });

  it("checks the emails of the team", () => {
    const data = cleanOnboardingData({ ...complete, team: { admins: "no-es-un-email" } });
    expect(onboardingProblems(data, ["rooms"])).toEqual([
      "Tu equipo: «no-es-un-email» no es un email válido",
    ]);
  });
});

describe("fileContentType", () => {
  it("accepts the right files for each kind", () => {
    expect(fileContentType("rooms", "Habitaciones.XLSX")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(fileContentType("photos", "fachada.jpg")).toBe("image/jpeg");
    expect(fileContentType("rooms", "virus.exe")).toBeNull();
    expect(fileContentType("logo", "logo.xlsx")).toBeNull();
  });
});
