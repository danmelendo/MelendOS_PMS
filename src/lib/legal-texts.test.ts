import { describe, expect, it } from "vitest";
import { legalPage, type HotelLegal } from "./legal-texts";

const hotel: HotelLegal = {
  name: "Hotel Lumen",
  legal_name: "Lumen Hoteles SL",
  nif: "B12345678",
  address: "Calle Mayor 1, 46001 Valencia",
  email: "hola@lumen.example",
  phone: "+34 960 000 000",
  domain: null,
  checkin_hour: 15,
  checkout_hour: 12,
  payment: { modes: ["prepay", "at_hotel"] },
  cancellation: { free_hours: 48, penalty: "first_night" },
  loyalty: false,
  assistant: true,
};
const text = (page: Parameters<typeof legalPage>[0], d = hotel) =>
  legalPage(page, d)
    .flatMap((s) => [s.heading, ...s.paragraphs])
    .join("\n");

describe("legal pages", () => {
  it("identify the hotel as the holder of the web and the data controller", () => {
    for (const page of ["aviso-legal", "privacidad"] as const) {
      expect(text(page)).toContain("Titular: Lumen Hoteles SL, que opera como «Hotel Lumen».");
      expect(text(page)).toContain("NIF: B12345678.");
    }
  });

  it("say what is missing instead of inventing it", () => {
    const t = text("aviso-legal", { ...hotel, legal_name: null, nif: null });
    expect(t).toContain("Titular: (pendiente de completar por el establecimiento).");
  });

  it("write the booking conditions from the hotel's policies", () => {
    const t = text("condiciones");
    expect(t).toContain("Puedes cancelar gratis hasta 2 días (48 horas) antes");
    expect(text("condiciones", { ...hotel, cancellation: { free_hours: 36 } })).toContain(
      "hasta 36 horas antes",
    );
    expect(t).toContain("importe de la primera noche");
    expect(t).toContain("Pago online");
    expect(t).toContain("Pago en el hotel");
    expect(t).toContain("Entrada a partir de las 15:00 y salida hasta las 12:00.");
    const strict = text("condiciones", {
      ...hotel,
      payment: { modes: ["prepay"] },
      cancellation: { free_hours: 0, penalty: "full" },
    });
    expect(strict).toContain("no tiene cancelación gratuita");
    expect(strict).toContain("importe total");
    expect(strict).not.toContain("Pago en el hotel");
  });

  it("mention the AI assistant and the club only when the hotel has them", () => {
    expect(text("privacidad")).toContain("inteligencia artificial");
    expect(text("privacidad")).not.toContain("club de fidelización");
    const t = text("privacidad", { ...hotel, assistant: false, loyalty: true });
    expect(t).not.toContain("inteligencia artificial");
    expect(t).toContain("club de fidelización");
  });
});
