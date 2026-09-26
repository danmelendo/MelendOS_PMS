// A hotel's payment and cancellation policies (tenants.settings), shared by
// bookings, the booking pages, the panel, the agent and the database mirror
// (public.free_cancellation_until).
//
// Payment: the guest pays the whole stay online when booking ("prepay") or
// pays at the hotel ("at_hotel"); each hotel offers one or both. There is no
// partial deposit.
// Cancellation: free until N hours before check-in; after that, a penalty
// (nothing, the first night or the whole stay).

export type PaymentMode = "prepay" | "at_hotel";
export type CancellationPenalty = "none" | "first_night" | "full";

export interface HotelPolicies {
  paymentModes: PaymentMode[];
  defaultPaymentMode: PaymentMode;
  freeCancellationHours: number;
  penalty: CancellationPenalty;
}

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  prepay: "Pago online al reservar",
  at_hotel: "Pago en el hotel",
};

const MODES: PaymentMode[] = ["prepay", "at_hotel"];
const PENALTIES: CancellationPenalty[] = ["none", "first_night", "full"];

/** Policies from tenants.settings, with safe defaults. */
export function hotelPolicies(settings: Record<string, unknown> | null | undefined): HotelPolicies {
  const payment = (settings?.payment ?? {}) as { modes?: unknown; default?: unknown };
  const cancellation = (settings?.cancellation ?? {}) as {
    free_hours?: unknown;
    penalty?: unknown;
  };
  const modes = Array.isArray(payment.modes)
    ? MODES.filter((m) => (payment.modes as unknown[]).includes(m))
    : [];
  const paymentModes = modes.length ? modes : (["prepay"] as PaymentMode[]);
  const hours = Number(cancellation.free_hours);
  return {
    paymentModes,
    defaultPaymentMode: paymentModes.includes(payment.default as PaymentMode)
      ? (payment.default as PaymentMode)
      : paymentModes[0],
    freeCancellationHours: Number.isFinite(hours) && hours >= 0 ? hours : 48,
    penalty: PENALTIES.includes(cancellation.penalty as CancellationPenalty)
      ? (cancellation.penalty as CancellationPenalty)
      : "first_night",
  };
}

/** What the guest pays online when booking. */
export function amountDueNow(total: number, mode: PaymentMode): number {
  return mode === "prepay" ? total : 0;
}

export interface CancellationTerms {
  /** Last instant of free cancellation (ISO). */
  freeUntil: string;
  /** True if cancelling now costs nothing. */
  freeNow: boolean;
  /** Amount kept if cancelled now. */
  penaltyNow: number;
}

export function cancellationTerms(
  p: HotelPolicies,
  startAt: Date | string,
  total: number,
  nights: number,
  now = new Date(),
): CancellationTerms {
  const start = typeof startAt === "string" ? new Date(startAt) : startAt;
  const freeUntil = new Date(start.getTime() - p.freeCancellationHours * 3_600_000);
  const freeNow = now.getTime() <= freeUntil.getTime();
  const penalty =
    p.penalty === "none"
      ? 0
      : p.penalty === "full"
        ? total
        : Math.round((total / Math.max(1, nights)) * 100) / 100;
  return { freeUntil: freeUntil.toISOString(), freeNow, penaltyNow: freeNow ? 0 : penalty };
}

/** One line for guests: "Cancelación gratuita hasta 48 h antes…". */
export function cancellationSummary(p: HotelPolicies): string {
  const when =
    p.freeCancellationHours >= 48 && p.freeCancellationHours % 24 === 0
      ? `${p.freeCancellationHours / 24} días`
      : `${p.freeCancellationHours} h`;
  const after =
    p.penalty === "none"
      ? "después también se puede cancelar sin coste"
      : p.penalty === "full"
        ? "después se cobra la estancia completa"
        : "después se cobra la primera noche";
  return `Cancelación gratuita hasta ${when} antes de la llegada; ${after}.`;
}
