import { describe, expect, it } from "vitest";
import { amountDueNow, cancellationSummary, cancellationTerms, hotelPolicies } from "./policies.ts";

describe("hotelPolicies", () => {
  it("reads the settings and falls back to safe defaults", () => {
    expect(hotelPolicies({})).toEqual({
      paymentModes: ["prepay"],
      defaultPaymentMode: "prepay",
      freeCancellationHours: 48,
      penalty: "first_night",
    });
    expect(
      hotelPolicies({
        payment: { modes: ["at_hotel", "prepay", "bitcoin"], default: "at_hotel" },
        cancellation: { free_hours: 168, penalty: "full" },
      }),
    ).toEqual({
      paymentModes: ["prepay", "at_hotel"],
      defaultPaymentMode: "at_hotel",
      freeCancellationHours: 168,
      penalty: "full",
    });
    expect(hotelPolicies({ payment: { modes: ["at_hotel"], default: "prepay" } })).toMatchObject({
      defaultPaymentMode: "at_hotel",
    });
  });
});

describe("payments and cancellation", () => {
  const p = hotelPolicies({ cancellation: { free_hours: 48, penalty: "first_night" } });
  const start = "2026-10-10T13:00:00Z";

  it("pays the whole stay online, or nothing now at the hotel", () => {
    expect(amountDueNow(360, "prepay")).toBe(360);
    expect(amountDueNow(360, "at_hotel")).toBe(0);
  });

  it("is free until N hours before arrival, then costs the first night", () => {
    const early = cancellationTerms(p, start, 360, 3, new Date("2026-10-08T12:00:00Z"));
    expect(early).toEqual({ freeUntil: "2026-10-08T13:00:00.000Z", freeNow: true, penaltyNow: 0 });
    const late = cancellationTerms(p, start, 360, 3, new Date("2026-10-08T14:00:00Z"));
    expect(late).toMatchObject({ freeNow: false, penaltyNow: 120 });
    const full = hotelPolicies({ cancellation: { free_hours: 24, penalty: "full" } });
    expect(
      cancellationTerms(full, start, 360, 3, new Date("2026-10-10T00:00:00Z")).penaltyNow,
    ).toBe(360);
  });

  it("explains the policy in one line", () => {
    expect(cancellationSummary(p)).toBe(
      "Cancelación gratuita hasta 2 días antes de la llegada; después se cobra la primera noche.",
    );
    expect(
      cancellationSummary(hotelPolicies({ cancellation: { free_hours: 24, penalty: "full" } })),
    ).toBe(
      "Cancelación gratuita hasta 24 h antes de la llegada; después se cobra la estancia completa.",
    );
  });
});
