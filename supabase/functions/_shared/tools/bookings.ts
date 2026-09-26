// Booking draft: validates a stay request, checks availability and capacity,
// prices it on the server and creates the reservation with the hotel's
// payment and cancellation terms. Paid online ("prepay"): pending until the
// payment provider confirms it. Paid at the hotel ("at_hotel"): confirmed at
// once, nothing charged.
//
// Pure logic over a small data-access interface (BookingStore), so the same
// code runs in the Edge Function (Supabase), in the in-browser mock and, from
// phase 2, behind the booking agent's tool.
import { z } from "zod";
import { eachNight, isYmd, nightsBetween, zonedHourToUtc } from "../domain/dates.ts";
import { priceStay, round2, type DynamicRule, type PriceBreakdown } from "../domain/pricing.ts";
import {
  amountDueNow,
  cancellationTerms,
  type CancellationTerms,
  type HotelPolicies,
  type PaymentMode,
} from "../domain/policies.ts";

export const MAX_NIGHTS = 30;
export const HOLD_MINUTES = 30;

const ymd = z.string().refine(isYmd, "Fecha inválida (yyyy-MM-dd)");

export const bookingDraftInput = z
  .object({
    room_id: z.string().uuid().or(z.string().min(1)),
    check_in: ymd,
    check_out: ymd,
    guests: z.number().int().min(1).max(12),
    /** Keep the room for 30 minutes while the guest pays (online payment). */
    hold: z.boolean().default(false),
    /** Pay the whole stay online now, or at the hotel. Default: the hotel's. */
    payment_mode: z.enum(["prepay", "at_hotel"]).optional(),
    customer: z
      .object({
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(200),
        phone: z.string().trim().max(40).optional(),
      })
      .optional(),
    extras: z
      .array(z.object({ extra_id: z.string().min(1), qty: z.number().int().min(1).max(50) }))
      .max(20)
      .default([]),
  })
  .refine((v) => nightsBetween(v.check_in, v.check_out) >= 1, {
    message: "La salida debe ser posterior a la entrada",
    path: ["check_out"],
  })
  .refine((v) => nightsBetween(v.check_in, v.check_out) <= MAX_NIGHTS, {
    message: `Máximo ${MAX_NIGHTS} noches`,
    path: ["check_out"],
  });

export type BookingDraftInput = z.input<typeof bookingDraftInput>;

export interface TenantSettings {
  checkin_hour: number;
  checkout_hour: number;
  timezone: string;
  policies: HotelPolicies;
}

export interface StoreRoom {
  id: string;
  tenant_id: string;
  property_id: string;
  name: string;
  capacity: number;
  status: string;
  active: boolean;
  rate_group_id: string | null;
}

export interface NewReservation {
  tenant_id: string;
  room_id: string;
  property_id: string;
  customer_id: string | null;
  member_id: string | null;
  start_at: string;
  end_at: string;
  people: number;
  base_price: number;
  dynamic_surcharge: number;
  dynamic_reason: string | null;
  extras_total: number;
  total: number;
  /** Amount to pay online now (legacy column name): the total, or 0 at the hotel. */
  deposit_amount: number;
  payment_mode: PaymentMode;
  free_cancellation_until: string;
  late_cancellation_fee: number;
  status: "pending" | "confirmed";
  is_prebooking: boolean;
  hold_expires_at: string | null;
  created_by_role: "public" | "member" | "agent" | "mcp";
  /** SHA-256 (hex) of the guest access token; the token itself is never stored. */
  access_token_hash: string;
}

/** Everything the booking logic needs from storage. */
export interface BookingStore {
  getRoom(roomId: string): Promise<StoreRoom | null>;
  getTenantSettings(tenantId: string): Promise<TenantSettings>;
  /** Busy windows (with cleaning) of a tenant's rooms overlapping [from, to). */
  getBusyWindows(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<{ room_id: string; start_at: string; end_at: string }[]>;
  countActiveRooms(tenantId: string): Promise<number>;
  getRate(rateGroupId: string): Promise<{ price: number; weekend_price: number | null } | null>;
  getActiveRules(
    tenantId: string,
  ): Promise<{ name: string; type: string; multiplier: number; config: Record<string, unknown> }[]>;
  getActiveGifts(tenantId: string): Promise<{ min_extras_total: number; gift_extra_id: string }[]>;
  getExtras(
    tenantId: string,
    ids: string[],
  ): Promise<{ id: string; price: number; active: boolean }[]>;
  /** Member account of the signed-in user in this tenant, if any. */
  findMember(tenantId: string, userId: string): Promise<{ id: string } | null>;
  findOrCreateCustomer(
    tenantId: string,
    c: { name: string; email: string; phone?: string },
  ): Promise<string>;
  insertReservation(r: NewReservation): Promise<{ id: string }>;
  insertExtras(
    tenantId: string,
    reservationId: string,
    rows: { extra_id: string; qty: number; unit_price: number; is_gift: boolean }[],
  ): Promise<void>;
}

export interface BookingContext {
  /** Signed-in user (guest app); null for the anonymous public web. */
  userId: string | null;
  channel: "public" | "member" | "agent" | "mcp";
  /** Set by the server for agent/MCP calls: only this tenant's rooms exist. */
  tenantId?: string;
  now?: Date;
}

export class BookingError extends Error {
  constructor(
    readonly code: "invalid" | "not_found" | "unavailable" | "capacity" | "unpriced",
    message: string,
  ) {
    super(message);
  }
}

export interface BookingDraft {
  reservation_id: string;
  tenant_id: string;
  check_in: string;
  check_out: string;
  nights: number;
  breakdown: PriceBreakdown;
  payment_mode: PaymentMode;
  status: "pending" | "confirmed";
  /** What the guest pays online now: the whole stay, or 0 when paying at the hotel. */
  amount_due_now: number;
  free_cancellation_until: string;
  late_cancellation_fee: number;
  hold_expires_at: string | null;
  /** Returned once: lets the guest view, sign and cancel without an account. */
  access_token: string;
}

/** Random token for guest access, and the hash stored in the database. */
export async function newAccessToken(): Promise<{ token: string; hash: string }> {
  const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  const token = hex(crypto.getRandomValues(new Uint8Array(24)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return { token, hash: hex(new Uint8Array(digest)) };
}

export function toRules(
  rows: { name: string; type: string; multiplier: number; config: Record<string, unknown> }[],
): DynamicRule[] {
  const out: DynamicRule[] = [];
  for (const r of rows) {
    const cfg = r.config as { from?: string; to?: string; threshold?: number };
    if (r.type === "date" && cfg.from && cfg.to) {
      out.push({
        name: r.name,
        type: "date",
        multiplier: Number(r.multiplier),
        from: cfg.from,
        to: cfg.to,
      });
    } else if (r.type === "occupancy") {
      out.push({
        name: r.name,
        type: "occupancy",
        multiplier: Number(r.multiplier),
        threshold: Number(cfg.threshold ?? 0),
      });
    }
  }
  return out;
}

export interface QuoteRequest {
  room_id: string;
  check_in: string;
  check_out: string;
  guests: number;
  extras?: { extra_id: string; qty: number }[];
}

export interface StayQuote {
  room: StoreRoom;
  settings: TenantSettings;
  startAt: Date;
  endAt: Date;
  nights: number;
  breakdown: PriceBreakdown;
  /** Cancellation terms for this stay if booked now. */
  cancellation: CancellationTerms;
  extras: { extraId: string; qty: number; price: number }[];
  /** False when the room is taken for those dates (price still computed). */
  available: boolean;
}

/**
 * Prices a stay for one room with the real engine, without writing anything.
 * Validates tenant scope, room, capacity and dates; reports availability.
 */
export async function quoteStay(
  store: BookingStore,
  req: QuoteRequest,
  ctx: BookingContext,
): Promise<StayQuote> {
  const now = ctx.now ?? new Date();
  const room = await store.getRoom(req.room_id);
  // A room of another tenant does not exist for this caller.
  if (!room || !room.active || (ctx.tenantId && room.tenant_id !== ctx.tenantId)) {
    throw new BookingError("not_found", "Habitación no encontrada");
  }
  if (room.status === "out_of_service") {
    throw new BookingError("unavailable", "La habitación no está disponible");
  }
  if (req.guests > room.capacity) {
    throw new BookingError("capacity", `La habitación admite hasta ${room.capacity} personas`);
  }
  if (!room.rate_group_id) throw new BookingError("unpriced", "La habitación no tiene tarifa");

  const settings = await store.getTenantSettings(room.tenant_id);
  const startAt = zonedHourToUtc(req.check_in, settings.checkin_hour, settings.timezone);
  const endAt = zonedHourToUtc(req.check_out, settings.checkout_hour, settings.timezone);
  if (startAt.getTime() < now.getTime() - 24 * 3_600_000) {
    throw new BookingError("invalid", "La fecha de entrada ya ha pasado");
  }

  // Busy windows over the stay (a day of margin for cleaning windows).
  const busy = await store.getBusyWindows(
    room.tenant_id,
    new Date(startAt.getTime() - 86_400_000),
    new Date(endAt.getTime() + 86_400_000),
  );
  const available = !busy.some(
    (b) =>
      b.room_id === room.id &&
      new Date(b.start_at).getTime() < endAt.getTime() &&
      startAt.getTime() < new Date(b.end_at).getTime(),
  );

  const wanted = req.extras ?? [];
  const [rate, ruleRows, gifts, extrasRows, totalRooms] = await Promise.all([
    store.getRate(room.rate_group_id),
    store.getActiveRules(room.tenant_id),
    store.getActiveGifts(room.tenant_id),
    store.getExtras(
      room.tenant_id,
      wanted.map((e) => e.extra_id),
    ),
    store.countActiveRooms(room.tenant_id),
  ]);
  if (!rate || !(rate.price > 0)) {
    throw new BookingError("unpriced", "La habitación no tiene tarifa");
  }

  const extras = wanted.map((e) => {
    const row = extrasRows.find((x) => x.id === e.extra_id && x.active);
    if (!row) throw new BookingError("invalid", "Extra no disponible");
    return { extraId: e.extra_id, qty: e.qty, price: Number(row.price) };
  });

  // Occupancy per night from the same busy windows.
  const occupied = busy
    .filter((b) => b.room_id !== room.id)
    .map((b) => ({
      checkIn: new Date(b.start_at).toISOString().slice(0, 10),
      checkOut: new Date(b.end_at).toISOString().slice(0, 10),
    }));

  const breakdown = priceStay({
    checkIn: req.check_in,
    checkOut: req.check_out,
    rate: {
      price: Number(rate.price),
      weekendPrice: rate.weekend_price != null ? Number(rate.weekend_price) : null,
    },
    rules: toRules(ruleRows),
    occupied,
    totalRooms,
    extras,
    gifts: gifts.map((g) => ({
      minExtrasTotal: Number(g.min_extras_total),
      giftExtraId: g.gift_extra_id,
    })),
  });

  return {
    room,
    settings,
    startAt,
    endAt,
    nights: eachNight(req.check_in, req.check_out).length,
    breakdown,
    cancellation: cancellationTerms(
      settings.policies,
      startAt,
      breakdown.total,
      eachNight(req.check_in, req.check_out).length,
      now,
    ),
    extras,
    available,
  };
}

export async function createBookingDraft(
  store: BookingStore,
  raw: unknown,
  ctx: BookingContext,
): Promise<BookingDraft> {
  const parsed = bookingDraftInput.safeParse(raw);
  if (!parsed.success) {
    throw new BookingError("invalid", parsed.error.issues.map((i) => i.message).join("; "));
  }
  const input = parsed.data;
  const now = ctx.now ?? new Date();

  const quote = await quoteStay(store, input, ctx);
  if (!quote.available) {
    throw new BookingError("unavailable", "La habitación no está libre en esas fechas");
  }
  const { room, breakdown } = quote;
  const policies = quote.settings.policies;
  const mode = input.payment_mode ?? policies.defaultPaymentMode;
  if (!policies.paymentModes.includes(mode)) {
    throw new BookingError(
      "invalid",
      mode === "at_hotel"
        ? "Este hotel no admite el pago en el hotel"
        : "Este hotel no admite el pago online",
    );
  }
  const status = mode === "at_hotel" ? "confirmed" : "pending";
  const dueNow = amountDueNow(breakdown.total, mode);

  const member = ctx.userId ? await store.findMember(room.tenant_id, ctx.userId) : null;
  if (!member && !input.customer) {
    throw new BookingError("invalid", "Nombre y email del huésped son obligatorios");
  }
  const customerId = member
    ? null
    : await store.findOrCreateCustomer(room.tenant_id, input.customer!);
  const holdExpiresAt =
    input.hold && mode === "prepay"
      ? new Date(now.getTime() + HOLD_MINUTES * 60_000).toISOString()
      : null;
  const access = await newAccessToken();

  const reservation = await store.insertReservation({
    tenant_id: room.tenant_id,
    room_id: room.id,
    property_id: room.property_id,
    customer_id: customerId,
    member_id: member?.id ?? null,
    start_at: quote.startAt.toISOString(),
    end_at: quote.endAt.toISOString(),
    people: input.guests,
    base_price: breakdown.base,
    dynamic_surcharge: breakdown.dynamicSurcharge,
    dynamic_reason: breakdown.dynamicReason,
    extras_total: breakdown.extrasTotal,
    total: breakdown.total,
    deposit_amount: dueNow,
    payment_mode: mode,
    free_cancellation_until: quote.cancellation.freeUntil,
    late_cancellation_fee: round2(
      policies.penalty === "none"
        ? 0
        : policies.penalty === "full"
          ? breakdown.total
          : breakdown.total / quote.nights,
    ),
    status,
    is_prebooking: !!holdExpiresAt,
    hold_expires_at: holdExpiresAt,
    created_by_role:
      ctx.channel === "agent" || ctx.channel === "mcp" ? ctx.channel : member ? "member" : "public",
    access_token_hash: access.hash,
  });

  const extraRows = quote.extras.map((e) => ({
    extra_id: e.extraId,
    qty: e.qty,
    unit_price: e.price,
    is_gift: false,
  }));
  for (const giftId of breakdown.giftedExtraIds) {
    if (!extraRows.some((r) => r.extra_id === giftId)) {
      extraRows.push({ extra_id: giftId, qty: 1, unit_price: 0, is_gift: true });
    }
  }
  if (extraRows.length) await store.insertExtras(room.tenant_id, reservation.id, extraRows);

  return {
    reservation_id: reservation.id,
    tenant_id: room.tenant_id,
    check_in: input.check_in,
    check_out: input.check_out,
    nights: quote.nights,
    breakdown,
    payment_mode: mode,
    status,
    amount_due_now: dueNow,
    free_cancellation_until: quote.cancellation.freeUntil,
    late_cancellation_fee: round2(
      policies.penalty === "none"
        ? 0
        : policies.penalty === "full"
          ? breakdown.total
          : breakdown.total / quote.nights,
    ),
    hold_expires_at: holdExpiresAt,
    access_token: access.token,
  };
}
