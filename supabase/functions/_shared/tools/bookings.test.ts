import { describe, expect, it } from "vitest";
import { hotelPolicies } from "../domain/policies.ts";
import {
  BookingError,
  createBookingDraft,
  type BookingStore,
  type NewReservation,
} from "./bookings.ts";

const NOW = new Date("2026-09-25T10:00:00Z");

function fakeStore(
  over: Partial<{
    busy: { room_id: string; start_at: string; end_at: string }[];
    /** Uses left of the promo code "OTONO15" (15 %); undefined = no code. */
    promoUses: number;
  }> = {},
) {
  let promoUses = over.promoUses;
  const inserted: NewReservation[] = [];
  const extras: { reservationId: string; rows: unknown[] }[] = [];
  const store: BookingStore = {
    async getRoom(id) {
      if (id === "missing") return null;
      return {
        id,
        tenant_id: "t1",
        property_id: "p1",
        name: "101",
        capacity: id === "single" ? 1 : 2,
        status: id === "broken" ? "out_of_service" : "available",
        active: true,
        rate_group_id: "rg",
      };
    },
    async getTenantSettings() {
      return {
        checkin_hour: 15,
        checkout_hour: 12,
        timezone: "Europe/Madrid",
        policies: hotelPolicies({ payment: { modes: ["prepay", "at_hotel"] } }),
      };
    },
    async getBusyWindows() {
      return over.busy ?? [];
    },
    async countActiveRooms() {
      return 10;
    },
    async getRate() {
      return { price: 100, weekend_price: 130 };
    },
    async getActiveRules() {
      return [];
    },
    async getActiveGifts() {
      return [{ min_extras_total: 50, gift_extra_id: "late" }];
    },
    async getExtras() {
      return [{ id: "breakfast", price: 18, active: true }];
    },
    async findMember(_t, userId) {
      return userId === "u-member" ? { id: "m1" } : null;
    },
    async findOrCreateCustomer() {
      return "c1";
    },
    async findPromoCode(_t, code) {
      return code.toUpperCase() === "OTONO15" && (promoUses ?? 0) > 0
        ? { id: "promo-1", code: "OTONO15", discount_type: "percent", discount_value: 15 }
        : null;
    },
    async claimPromoCode() {
      if (!promoUses) return false;
      promoUses -= 1;
      return true;
    },
    async insertReservation(r) {
      inserted.push(r);
      return { id: `r${inserted.length}` };
    },
    async insertExtras(_t, reservationId, rows) {
      extras.push({ reservationId, rows });
    },
  };
  return { store, inserted, extras };
}

const base = {
  room_id: "room-1",
  check_in: "2026-10-01",
  check_out: "2026-10-04",
  guests: 2,
  customer: { name: "Laura Gómez", email: "laura@example.com" },
};

describe("createBookingDraft", () => {
  it("prices on the server and creates a pending prepaid reservation in hotel time", async () => {
    const { store, inserted } = fakeStore();
    const draft = await createBookingDraft(store, base, {
      userId: null,
      channel: "public",
      now: NOW,
    });
    expect(draft.breakdown.total).toBe(360); // Thu 100 + Fri 130 + Sat 130
    // No deposit: the whole stay is paid online, or nothing now at the hotel.
    expect(draft).toMatchObject({
      payment_mode: "prepay",
      status: "pending",
      amount_due_now: 360,
      free_cancellation_until: "2026-09-29T13:00:00.000Z", // 48 h before check-in
      late_cancellation_fee: 120, // first night
    });
    expect(draft.access_token).toMatch(/^[0-9a-f]{48}$/);
    expect(inserted[0].access_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(inserted[0].access_token_hash).not.toBe(draft.access_token);
    expect(inserted[0]).toMatchObject({
      status: "pending",
      customer_id: "c1",
      member_id: null,
      start_at: "2026-10-01T13:00:00.000Z", // 15:00 CEST
      end_at: "2026-10-04T10:00:00.000Z", // 12:00 CEST
      created_by_role: "public",
      is_prebooking: false,
      payment_mode: "prepay",
      deposit_amount: 360,
    });
  });

  it("confirms at once, with nothing to pay now, when paying at the hotel", async () => {
    const { store, inserted } = fakeStore();
    const draft = await createBookingDraft(
      store,
      { ...base, payment_mode: "at_hotel" },
      { userId: null, channel: "public", now: NOW },
    );
    expect(draft).toMatchObject({ status: "confirmed", amount_due_now: 0, hold_expires_at: null });
    expect(inserted[0]).toMatchObject({
      status: "confirmed",
      payment_mode: "at_hotel",
      deposit_amount: 0,
      is_prebooking: false,
    });
  });

  it("uses the member account of a signed-in guest instead of a customer", async () => {
    const { store, inserted } = fakeStore();
    const { customer: _omit, ...noCustomer } = base;
    await createBookingDraft(store, noCustomer, {
      userId: "u-member",
      channel: "member",
      now: NOW,
    });
    expect(inserted[0]).toMatchObject({
      member_id: "m1",
      customer_id: null,
      created_by_role: "member",
    });
  });

  it("holds the room while the guest pays: 20 minutes on the web, 60 for a link", async () => {
    const web = fakeStore();
    const draft = await createBookingDraft(web.store, base, {
      userId: null,
      channel: "public",
      now: NOW,
    });
    expect(draft.hold_expires_at).toBe("2026-09-25T10:20:00.000Z");
    expect(web.inserted[0].is_prebooking).toBe(false);
    const agent = fakeStore();
    const link = await createBookingDraft(agent.store, base, {
      userId: null,
      channel: "agent",
      now: NOW,
    });
    expect(link.hold_expires_at).toBe("2026-09-25T11:00:00.000Z");
  });

  it("prices extras from the database and adds gifts", async () => {
    const { store, extras } = fakeStore();
    const draft = await createBookingDraft(
      store,
      { ...base, extras: [{ extra_id: "breakfast", qty: 4 }] },
      { userId: null, channel: "public", now: NOW },
    );
    expect(draft.breakdown.extrasTotal).toBe(72);
    expect(extras[0].rows).toEqual([
      { extra_id: "breakfast", qty: 4, unit_price: 18, is_gift: false },
      { extra_id: "late", qty: 1, unit_price: 0, is_gift: true },
    ]);
  });

  it("refuses busy rooms, too many guests, missing rooms and bad dates", async () => {
    const busy = fakeStore({
      busy: [
        { room_id: "room-1", start_at: "2026-10-02T13:00:00Z", end_at: "2026-10-03T11:00:00Z" },
      ],
    });
    const ctx = { userId: null, channel: "public" as const, now: NOW };
    await expect(createBookingDraft(busy.store, base, ctx)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(busy.inserted).toHaveLength(0);

    const { store } = fakeStore();
    await expect(
      createBookingDraft(store, { ...base, room_id: "single" }, ctx),
    ).rejects.toMatchObject({
      code: "capacity",
    });
    await expect(
      createBookingDraft(store, { ...base, room_id: "missing" }, ctx),
    ).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      createBookingDraft(store, { ...base, room_id: "broken" }, ctx),
    ).rejects.toMatchObject({
      code: "unavailable",
    });
    await expect(
      createBookingDraft(store, { ...base, check_out: base.check_in }, ctx),
    ).rejects.toBeInstanceOf(BookingError);
    await expect(
      createBookingDraft(store, { ...base, check_in: "2026-09-01", check_out: "2026-09-03" }, ctx),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("requires guest details from anonymous visitors", async () => {
    const { store } = fakeStore();
    const { customer: _omit, ...noCustomer } = base;
    await expect(
      createBookingDraft(store, noCustomer, { userId: null, channel: "public", now: NOW }),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("accepts a stay that starts once the previous guest's cleaning is done", async () => {
    const { store, inserted } = fakeStore({
      busy: [
        { room_id: "room-1", start_at: "2026-09-29T13:00:00Z", end_at: "2026-10-01T10:15:00Z" },
      ],
    });
    await createBookingDraft(store, base, { userId: null, channel: "public", now: NOW });
    expect(inserted).toHaveLength(1);
  });

  it("applies a promo code to the room price only and counts one use", async () => {
    const { store, inserted } = fakeStore({ promoUses: 1 });
    const draft = await createBookingDraft(
      store,
      { ...base, promo_code: "otono15", extras: [{ extra_id: "breakfast", qty: 1 }] },
      { userId: null, channel: "public", now: NOW },
    );
    // 15 % of the 360 of the room; the 18 of breakfast is not discounted.
    expect(draft.breakdown).toMatchObject({ discount: 54, promoCode: "OTONO15", total: 324 });
    expect(draft.amount_due_now).toBe(324);
    expect(inserted[0]).toMatchObject({
      discount_amount: 54,
      promo_code_id: "promo-1",
      total: 324,
    });
    // Used up: the next booking with it is refused, and nothing is created.
    await expect(
      createBookingDraft(
        store,
        { ...base, promo_code: "OTONO15" },
        { userId: null, channel: "public", now: NOW },
      ),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(inserted).toHaveLength(1);
  });

  it("refuses an unknown promo code instead of booking at full price", async () => {
    const { store, inserted } = fakeStore();
    await expect(
      createBookingDraft(
        store,
        { ...base, promo_code: "NOEXISTE" },
        { userId: null, channel: "public", now: NOW },
      ),
    ).rejects.toMatchObject({ code: "invalid", message: expect.stringMatching(/código/) });
    expect(inserted).toHaveLength(0);
  });
});
