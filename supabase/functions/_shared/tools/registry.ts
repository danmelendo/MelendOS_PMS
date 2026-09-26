// ─────────────────────────────────────────────────────────────────────────────
// Domain tools shared by the booking agent (web chat) and the MCP server.
//
// Rules every tool follows:
// - The tenant comes from the server context (ToolContext.tenantId), never from
//   the model; a room or booking of another tenant simply does not exist.
// - Inputs are validated with Zod; the same schemas become the JSON Schema the
//   model sees (toolSchemas()).
// - Nothing irreversible happens here: bookings are created pending, payment
//   links only send the guest to pay, cancellations are *requests* the hotel
//   decides on.
// ─────────────────────────────────────────────────────────────────────────────
import { z } from "zod";
import { isYmd, nightsBetween, zonedHourToUtc } from "../domain/dates.ts";
import { priceStay, round2 } from "../domain/pricing.ts";
import { bookingReference as referenceOf } from "../domain/reference.ts";
import {
  cancellationSummary,
  PAYMENT_MODE_LABELS,
  type HotelPolicies,
  type PaymentMode,
} from "../domain/policies.ts";
import {
  GUEST_CANCELLATION_CATEGORIES,
  type CancellationCategory,
} from "../domain/cancellations.ts";
import {
  BookingError,
  bookingDraftInput,
  createBookingDraft,
  newAccessToken,
  quoteStay,
  toRules,
  type BookingStore,
} from "./bookings.ts";

// ── Storage the tools need beyond bookings ───────────────────────────────────
export interface CatalogRoom {
  id: string;
  tenant_id: string;
  property_id: string;
  property_name: string;
  name: string;
  category: string;
  capacity: number;
  features: string[];
  rate_group_id: string | null;
  rate_group_name: string | null;
  status: string;
  active: boolean;
}

export interface BookingLookup {
  id: string;
  tenant_id: string;
  reference: string;
  status: string;
  deposit_paid: boolean;
  is_prebooking: boolean;
  hold_expires_at: string | null;
  start_at: string;
  end_at: string;
  people: number;
  total: number;
  deposit_amount: number;
  payment_mode: PaymentMode;
  free_cancellation_until: string | null;
  late_cancellation_fee: number | null;
  room_name: string;
  property_name: string;
  /** Email of the booking's guest (customer or member), for identity checks. */
  guest_email: string | null;
}

export interface ToolStore extends BookingStore {
  listRooms(tenantId: string): Promise<CatalogRoom[]>;
  findBookingByReference(tenantId: string, reference: string): Promise<BookingLookup | null>;
  getBookingById(tenantId: string, id: string): Promise<BookingLookup | null>;
  createCancellationRequest(
    tenantId: string,
    reservationId: string,
    reason: string | null,
    channel: string,
    category?: CancellationCategory | null,
  ): Promise<{ id: string; created: boolean }>;
  setAccessTokenHash(tenantId: string, reservationId: string, hash: string): Promise<void>;
}

export interface ToolContext {
  /** Tenant the conversation belongs to, resolved by the server. */
  tenantId: string;
  /** Signed-in guest, if the channel has one. */
  userId: string | null;
  channel: "web_chat" | "mcp";
  /** Public web base URL of the tenant, for manage/payment links. */
  webUrl: string;
  now?: Date;
}

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string } };

class ToolError extends Error {
  constructor(
    readonly code: "invalid" | "not_found" | "conflict" | "unavailable",
    message: string,
  ) {
    super(message);
  }
}

export { referenceOf };

const paymentOptions = (p: HotelPolicies) => p.paymentModes.map((m) => PAYMENT_MODE_LABELS[m]);

/** Who the booking is recorded as made by (reports count bookings per channel). */
const bookingChannel = (ctx: ToolContext) => (ctx.channel === "mcp" ? "mcp" : "agent");

const ymd = z.string().refine(isYmd, "Date must be yyyy-MM-dd");
const stayDates = {
  check_in: ymd.describe("Arrival date (yyyy-MM-dd)"),
  check_out: ymd.describe("Departure date (yyyy-MM-dd), after check_in"),
};
const reference = z
  .string()
  .trim()
  .min(6)
  .max(12)
  .transform((s) => s.toUpperCase())
  .describe("Booking reference shown to the guest, e.g. 3F9A21C0");
const email = z.string().trim().email().max(200).describe("Email the booking was made with");

interface ToolDef<S extends z.ZodType> {
  name: string;
  description: string;
  readOnly: boolean;
  input: S;
  run(store: ToolStore, input: z.output<S>, ctx: ToolContext): Promise<unknown>;
}
const defineTool = <S extends z.ZodType>(t: ToolDef<S>) => t;

// ── Tool definitions ─────────────────────────────────────────────────────────
const searchAvailability = defineTool({
  name: "search_availability",
  description:
    "Find free rooms for given dates and number of guests, cheapest first. Optionally filter by maximum price per night, room category and features. Prices include dynamic pricing for those dates.",
  readOnly: true,
  input: z.object({
    ...stayDates,
    guests: z.number().int().min(1).max(12),
    max_price_per_night: z.number().positive().optional(),
    category: z.enum(["room", "suite", "family"]).optional(),
    features: z
      .array(z.string())
      .max(5)
      .optional()
      .describe("e.g. sea_view, balcony, bathtub, terrace, city_view"),
    limit: z.number().int().min(1).max(10).default(5),
  }),
  async run(store, input, ctx) {
    const nights = nightsBetween(input.check_in, input.check_out);
    if (nights < 1 || nights > 30) throw new ToolError("invalid", "Stay must be 1 to 30 nights");
    const now = ctx.now ?? new Date();
    const settings = await store.getTenantSettings(ctx.tenantId);
    const startAt = zonedHourToUtc(input.check_in, settings.checkin_hour, settings.timezone);
    const endAt = zonedHourToUtc(input.check_out, settings.checkout_hour, settings.timezone);
    if (startAt.getTime() < now.getTime() - 24 * 3_600_000) {
      throw new ToolError("invalid", "Arrival date is in the past");
    }

    const [rooms, busy, ruleRows, totalRooms] = await Promise.all([
      store.listRooms(ctx.tenantId),
      store.getBusyWindows(
        ctx.tenantId,
        new Date(startAt.getTime() - 86_400_000),
        new Date(endAt.getTime() + 86_400_000),
      ),
      store.getActiveRules(ctx.tenantId),
      store.countActiveRooms(ctx.tenantId),
    ]);
    const candidates = rooms.filter(
      (r) =>
        r.active &&
        r.status !== "out_of_service" &&
        r.rate_group_id &&
        r.capacity >= input.guests &&
        (!input.category || r.category === input.category) &&
        (input.features ?? []).every((f) => r.features.includes(f)),
    );
    const isBusy = (roomId: string) =>
      busy.some(
        (b) =>
          b.room_id === roomId &&
          new Date(b.start_at).getTime() < endAt.getTime() &&
          startAt.getTime() < new Date(b.end_at).getTime(),
      );
    const occupied = busy.map((b) => ({
      checkIn: new Date(b.start_at).toISOString().slice(0, 10),
      checkOut: new Date(b.end_at).toISOString().slice(0, 10),
    }));
    const rules = toRules(ruleRows);
    const rates = new Map<string, { price: number; weekend_price: number | null } | null>();

    const results = [];
    for (const r of candidates) {
      if (isBusy(r.id)) continue;
      if (!rates.has(r.rate_group_id!))
        rates.set(r.rate_group_id!, await store.getRate(r.rate_group_id!));
      const rate = rates.get(r.rate_group_id!);
      if (!rate || !(rate.price > 0)) continue;
      const b = priceStay({
        checkIn: input.check_in,
        checkOut: input.check_out,
        rate: {
          price: Number(rate.price),
          weekendPrice: rate.weekend_price != null ? Number(rate.weekend_price) : null,
        },
        rules,
        occupied,
        totalRooms,
        extras: [],
        gifts: [],
      });
      const perNight = round2(b.total / nights);
      if (input.max_price_per_night && perNight > input.max_price_per_night) continue;
      results.push({
        room_id: r.id,
        room: r.name,
        hotel: r.property_name,
        type: r.rate_group_name,
        category: r.category,
        capacity: r.capacity,
        features: r.features,
        price_total: b.total,
        price_per_night: perNight,
        dynamic_pricing: b.dynamicReason,
      });
    }
    results.sort((a, b) => a.price_total - b.price_total);
    return {
      check_in: input.check_in,
      check_out: input.check_out,
      nights,
      guests: input.guests,
      currency: "EUR",
      results: results.slice(0, input.limit),
      total_matches: results.length,
      payment_options: paymentOptions(settings.policies),
      cancellation_policy: cancellationSummary(settings.policies),
    };
  },
});

const getUnitDetails = defineTool({
  name: "get_unit_details",
  description: "Details of one room: hotel, category, capacity, features and base nightly rates.",
  readOnly: true,
  input: z.object({ room_id: z.string().min(1) }),
  async run(store, input, ctx) {
    const room = (await store.listRooms(ctx.tenantId)).find(
      (r) => r.id === input.room_id && r.active,
    );
    if (!room) throw new ToolError("not_found", "Room not found");
    const rate = room.rate_group_id ? await store.getRate(room.rate_group_id) : null;
    const settings = await store.getTenantSettings(ctx.tenantId);
    return {
      room_id: room.id,
      room: room.name,
      hotel: room.property_name,
      type: room.rate_group_name,
      category: room.category,
      capacity: room.capacity,
      features: room.features,
      base_price_per_night: rate ? Number(rate.price) : null,
      weekend_price_per_night: rate?.weekend_price != null ? Number(rate.weekend_price) : null,
      check_in_time: `${settings.checkin_hour}:00`,
      check_out_time: `${settings.checkout_hour}:00`,
      payment_options: paymentOptions(settings.policies),
      cancellation_policy: cancellationSummary(settings.policies),
    };
  },
});

const quotePrice = defineTool({
  name: "quote_price",
  description:
    "Exact price of a stay in one room for given dates, guests and optional extras, with the breakdown, the payment options and until when it can be cancelled for free. Does not book anything.",
  readOnly: true,
  input: z.object({
    room_id: z.string().min(1),
    ...stayDates,
    guests: z.number().int().min(1).max(12),
    extras: z
      .array(z.object({ extra_id: z.string().min(1), qty: z.number().int().min(1).max(50) }))
      .max(20)
      .default([]),
  }),
  async run(store, input, ctx) {
    const q = await quoteStay(store, input, {
      userId: ctx.userId,
      channel: bookingChannel(ctx),
      tenantId: ctx.tenantId,
      now: ctx.now,
    });
    return {
      room_id: q.room.id,
      room: q.room.name,
      check_in: input.check_in,
      check_out: input.check_out,
      nights: q.nights,
      available: q.available,
      currency: "EUR",
      accommodation: q.breakdown.base,
      dynamic_surcharge: q.breakdown.dynamicSurcharge,
      dynamic_reason: q.breakdown.dynamicReason,
      extras: q.breakdown.extrasTotal,
      gifted_extra_ids: q.breakdown.giftedExtraIds,
      total: q.breakdown.total,
      payment_options: paymentOptions(q.settings.policies),
      free_cancellation_until: q.cancellation.freeUntil,
      cancellation_policy: cancellationSummary(q.settings.policies),
    };
  },
});

const createDraft = defineTool({
  name: "create_booking_draft",
  description:
    "Create the booking once the guest has explicitly agreed to the room, dates and price, has chosen how to pay and has given their name and email. payment_mode 'prepay': the guest pays the whole stay online (pending until paid). 'at_hotel': confirmed now, paid at the hotel. Returns the reference; the guest gets the buttons to manage (and pay) the booking.",
  readOnly: false,
  input: bookingDraftInput,
  async run(store, input, ctx) {
    const d = await createBookingDraft(store, input, {
      userId: ctx.userId,
      channel: bookingChannel(ctx),
      tenantId: ctx.tenantId,
      now: ctx.now,
    });
    return {
      reservation_id: d.reservation_id,
      reference: referenceOf(d.reservation_id),
      status: d.status,
      payment_mode: d.payment_mode,
      check_in: d.check_in,
      check_out: d.check_out,
      nights: d.nights,
      total: d.breakdown.total,
      to_pay_online_now: d.amount_due_now,
      free_cancellation_until: d.free_cancellation_until,
      late_cancellation_fee: d.late_cancellation_fee,
      hold_expires_at: d.hold_expires_at,
      manage_url: `${ctx.webUrl}/web/booking/${d.reservation_id}?t=${d.access_token}`,
    };
  },
});

const createPaymentLink = defineTool({
  name: "create_payment_link",
  description:
    "Get the link where the guest pays online the whole stay of a pending booking made with payment_mode 'prepay'. The guest starts the payment; the booking is confirmed only when the payment provider confirms it.",
  readOnly: false,
  input: z.object({ reservation_id: z.string().min(1) }),
  async run(store, input, ctx) {
    const b = await store.getBookingById(ctx.tenantId, input.reservation_id);
    if (!b) throw new ToolError("not_found", "Booking not found");
    if (b.payment_mode === "at_hotel") {
      throw new ToolError("conflict", "This booking is paid at the hotel");
    }
    if (b.status !== "pending" || b.deposit_paid) {
      throw new ToolError("conflict", "This booking is not awaiting payment");
    }
    const now = ctx.now ?? new Date();
    if (b.is_prebooking && b.hold_expires_at && new Date(b.hold_expires_at) < now) {
      throw new ToolError("conflict", "The hold on this room has expired");
    }
    // A fresh access token goes in the link (only its hash is stored).
    const access = await newAccessToken();
    await store.setAccessTokenHash(ctx.tenantId, b.id, access.hash);
    return {
      reference: b.reference,
      amount: Number(b.deposit_amount),
      currency: "EUR",
      payment_url: `${ctx.webUrl}/web/checkout/${b.id}?t=${access.token}`,
    };
  },
});

function publicBooking(b: BookingLookup) {
  return {
    reference: b.reference,
    status: b.deposit_paid && b.status === "pending" ? "confirming_payment" : b.status,
    hotel: b.property_name,
    room: b.room_name,
    check_in: b.start_at,
    check_out: b.end_at,
    guests: b.people,
    total: Number(b.total),
    payment_mode: b.payment_mode,
    paid_online: b.deposit_paid,
    free_cancellation_until: b.free_cancellation_until,
    late_cancellation_fee: Number(b.late_cancellation_fee ?? 0),
  };
}

async function verifiedBooking(store: ToolStore, ctx: ToolContext, ref: string, mail: string) {
  const b = await store.findBookingByReference(ctx.tenantId, ref);
  // Same answer whether the reference or the email is wrong: no enumeration.
  if (!b || !b.guest_email || b.guest_email.toLowerCase() !== mail.trim().toLowerCase()) {
    throw new ToolError("not_found", "No booking matches that reference and email");
  }
  return b;
}

const getBooking = defineTool({
  name: "get_booking",
  description: "Look up a booking with its reference and the guest's email.",
  readOnly: true,
  input: z.object({ reference, email }),
  async run(store, input, ctx) {
    return publicBooking(await verifiedBooking(store, ctx, input.reference, input.email));
  },
});

const requestCancellation = defineTool({
  name: "request_cancellation",
  description:
    "Ask the hotel to cancel a booking (reference + guest email). This only files a request: hotel staff approve or reject it and handle any refund. Use only after the guest explicitly asks to cancel.",
  readOnly: false,
  input: z.object({
    reference,
    email,
    reason: z.string().trim().max(500).optional(),
    reason_category: z
      .enum(GUEST_CANCELLATION_CATEGORIES as [CancellationCategory, ...CancellationCategory[]])
      .optional()
      .describe(
        "Why the guest cancels, if they said: change_of_plans, personal (illness…), work, travel_disruption, found_alternative, booking_error, force_majeure (weather…), other",
      ),
  }),
  async run(store, input, ctx) {
    const b = await verifiedBooking(store, ctx, input.reference, input.email);
    if (!["pending", "confirmed"].includes(b.status)) {
      throw new ToolError("conflict", `A booking in status ${b.status} cannot be cancelled`);
    }
    const req = await store.createCancellationRequest(
      ctx.tenantId,
      b.id,
      input.reason ?? null,
      ctx.channel,
      input.reason_category ?? null,
    );
    return {
      reference: b.reference,
      request_id: req.id,
      status: "pending_hotel_review",
      already_requested: !req.created,
    };
  },
});

// ── Registry ─────────────────────────────────────────────────────────────────
export const TOOLS = [
  searchAvailability,
  getUnitDetails,
  quotePrice,
  createDraft,
  createPaymentLink,
  getBooking,
  requestCancellation,
] as const;

export type ToolName = (typeof TOOLS)[number]["name"];

/** Name, description and JSON Schema of every tool, for the model / MCP. */
export function toolSchemas() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    read_only: t.readOnly,
    input_schema: z.toJSONSchema(t.input, { io: "input" }) as Record<string, unknown>,
  }));
}

/** Validates the input and runs a tool; errors come back as data, not throws. */
export async function runTool(
  name: string,
  rawInput: unknown,
  store: ToolStore,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { ok: false, error: { code: "unknown_tool", message: `Unknown tool ${name}` } };
  const parsed = tool.input.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "invalid",
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      },
    };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each tool validated its own input above
    const data = await (tool.run as (s: ToolStore, i: any, c: ToolContext) => Promise<unknown>)(
      store,
      parsed.data,
      ctx,
    );
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ToolError || e instanceof BookingError) {
      return { ok: false, error: { code: e.code, message: e.message } };
    }
    throw e;
  }
}
