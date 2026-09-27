import { describe, expect, it } from "vitest";
import { COUNTRIES, alpha2, alpha3 } from "./countries.ts";
import {
  ageOn,
  maskDocument,
  partyIssues,
  sesPaymentType,
  splitFullName,
  travellerIssues,
  validNie,
  validNif,
  type SesTraveller,
} from "./ses.ts";

const adult: SesTraveller = {
  first_name: "Laura",
  last_name1: "Gómez",
  last_name2: "Ruiz",
  document_type: "NIF",
  document_number: "12345678Z",
  document_support: "ABC123456",
  birth_date: "1990-05-01",
  nationality: "ESP",
  sex: "M",
  address: "Calle Mayor 1",
  municipality_code: "46250",
  postal_code: "46001",
  country: "ESP",
  email: "laura@example.com",
};
const fields = (t: SesTraveller, day = "2026-10-01") => travellerIssues(t, day).map((i) => i.field);

describe("documents", () => {
  it("checks the DNI and NIE control letter", () => {
    expect(validNif("12345678Z")).toBe(true);
    expect(validNif("12345678-z")).toBe(true);
    expect(validNif("12345678A")).toBe(false);
    expect(validNie("X1234567L")).toBe(true);
    expect(validNie("Y1234567X")).toBe(true);
    expect(validNie("X1234567A")).toBe(false);
  });
  it("masks all but the last 3 characters", () => {
    expect(maskDocument("12345678Z")).toBe("••••••78Z");
    expect(maskDocument("AB1")).toBe("•••");
    expect(maskDocument(null)).toBeNull();
  });
});

describe("travellerIssues", () => {
  it("accepts a complete adult with a DNI", () => {
    expect(travellerIssues(adult, "2026-10-01")).toEqual([]);
  });
  it("asks adults for a document, and DNI holders for a second surname and support", () => {
    expect(fields({ ...adult, document_type: null, document_number: null })).toEqual([
      "document_type",
      "document_number",
    ]);
    expect(fields({ ...adult, last_name2: null, document_support: null })).toEqual([
      "last_name2",
      "document_support",
    ]);
    expect(fields({ ...adult, document_number: "12345678A" })).toEqual(["document_number"]);
  });
  it("does not ask a passport for a second surname or support number", () => {
    expect(
      fields({
        ...adult,
        document_type: "PAS",
        document_number: "XDA123456",
        last_name2: null,
        document_support: null,
      }),
    ).toEqual([]);
  });
  it("asks minors for their relation with an adult, not for a document", () => {
    const child = {
      ...adult,
      birth_date: "2018-03-01",
      document_type: null,
      document_number: null,
    };
    expect(fields(child)).toEqual(["kinship"]);
    expect(fields({ ...child, kinship: "HJ" })).toEqual([]);
    expect(fields({ ...child, kinship: "XX" })).toEqual(["kinship"]);
  });
  it("turns 18 on the birthday", () => {
    expect(ageOn("2008-10-01", "2026-10-01")).toBe(18);
    expect(ageOn("2008-10-02", "2026-10-01")).toBe(17);
  });
  it("needs an INE code in Spain and a city abroad", () => {
    expect(fields({ ...adult, municipality_code: "462" })).toEqual(["municipality_code"]);
    const abroad = {
      ...adult,
      document_type: "PAS",
      document_support: null,
      country: "FRA",
      municipality_code: null,
    };
    expect(fields(abroad)).toEqual(["municipality_name"]);
    expect(fields({ ...abroad, municipality_name: "Lyon" })).toEqual([]);
  });
  it("needs a phone or an email, and a valid email", () => {
    expect(fields({ ...adult, email: null })).toEqual(["phone"]);
    expect(fields({ ...adult, email: null, phone: "600000000" })).toEqual([]);
    expect(fields({ ...adult, email: "no-es-un-email" })).toEqual(["email"]);
  });
});

describe("partyIssues", () => {
  it("wants every guest registered and minors with an adult", () => {
    const child = {
      ...adult,
      birth_date: "2018-03-01",
      document_type: null,
      document_number: null,
      kinship: "HJ",
    };
    expect(partyIssues([adult], "2026-10-01", 2).party.map((i) => i.message)).toEqual([
      "Faltan 1 de 2 viajeros por registrar",
    ]);
    expect(partyIssues([child], "2026-10-01", 1).party).toHaveLength(1);
    expect(partyIssues([adult, child], "2026-10-01", 2).party).toEqual([]);
  });
});

describe("helpers", () => {
  it("splits a single name field into name and surnames", () => {
    expect(splitFullName("Laura Gómez Ruiz")).toEqual({
      first_name: "Laura",
      last_name1: "Gómez",
      last_name2: "Ruiz",
    });
    expect(splitFullName("Laura")).toEqual({
      first_name: "Laura",
      last_name1: null,
      last_name2: null,
    });
  });
  it("maps how the booking is paid to the ministry codes", () => {
    expect(sesPaymentType({ payment_mode: "prepay" })).toBe("PLATF");
    expect(sesPaymentType({ payment_mode: "at_hotel" })).toBe("DESTI");
    expect(sesPaymentType({ payment_mode: "at_hotel", channel_id: "x" })).toBe("PLATF");
  });
  it("has every ISO country once, with names", () => {
    expect(COUNTRIES).toHaveLength(249);
    expect(new Set(COUNTRIES.map((c) => c[1])).size).toBe(249);
    const names = new Intl.DisplayNames(["es"], { type: "region" });
    for (const [a2] of COUNTRIES) expect(names.of(a2)).not.toBe(a2);
    expect(alpha3("es")).toBe("ESP");
    expect(alpha2("GBR")).toBe("GB");
  });
});
