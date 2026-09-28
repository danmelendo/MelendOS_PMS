// Test fixtures for the domain tools: two tenants, a few rooms and bookings,
// and an in-memory ToolStore. Used by the tool and agent tests.
import type { NewReservation } from "./bookings.ts";
import { hotelPolicies } from "../domain/policies.ts";
import type { BookingLookup, CatalogRoom, ToolStore } from "./registry.ts";

export const room = (over: Partial<CatalogRoom>): CatalogRoom => ({
  id: "r-101",
  tenant_id: "t1",
  property_id: "p1",
  property_name: "Hotel Uno",
  name: "101",
  category: "room",
  capacity: 2,
  features: ["wifi"],
  rate_group_id: "rg-std",
  rate_group_name: "Doble",
  status: "available",
  active: true,
  image_url: "/imagenes/rooms/test.svg",
  ...over,
});

export const ROOMS: CatalogRoom[] = [
  room({}),
  room({ id: "r-102", name: "102", rate_group_id: "rg-cheap" }),
  room({
    id: "r-201",
    name: "201",
    category: "suite",
    capacity: 4,
    features: ["wifi", "terrace"],
    rate_group_id: "rg-suite",
  }),
  room({ id: "r-301", name: "301", status: "out_of_service" }),
  // Another hotel company: must never show up for t1.
  room({
    id: "r-x1",
    tenant_id: "t2",
    property_id: "p2",
    property_name: "Hotel Dos",
    rate_group_id: "rg-x",
  }),
];
export const RATES: Record<string, { price: number; weekend_price: number | null }> = {
  "rg-std": { price: 100, weekend_price: null },
  "rg-cheap": { price: 80, weekend_price: null },
  "rg-suite": { price: 200, weekend_price: null },
  "rg-x": { price: 10, weekend_price: null },
};

export const booking = (over: Partial<BookingLookup>): BookingLookup => ({
  id: "b1000000-0000-0000-0000-000000000000",
  tenant_id: "t1",
  reference: "B1000000",
  status: "pending",
  deposit_paid: false,
  is_prebooking: false,
  hold_expires_at: null,
  start_at: "2026-10-01T13:00:00Z",
  end_at: "2026-10-03T10:00:00Z",
  people: 2,
  total: 200,
  deposit_amount: 200,
  payment_mode: "prepay",
  free_cancellation_until: "2026-09-29T13:00:00Z",
  late_cancellation_fee: 100,
  room_name: "101",
  property_name: "Hotel Uno",
  guest_email: "laura@example.com",
  guest_name: "Laura Gómez Ruiz",
  ...over,
});

export const EXTRAS = [
  { id: "x-breakfast", name: "Desayuno buffet", category: "breakfast", price: 18 },
  { id: "x-parking", name: "Parking", category: "parking", price: 22 },
];

export function fakeStore(
  opts: { busy?: { room_id: string; start_at: string; end_at: string }[] } = {},
) {
  const bookings = [
    booking({}),
    booking({
      id: "b2000000-0000-0000-0000-000000000000",
      reference: "B2000000",
      status: "confirmed",
      deposit_paid: true,
    }),
    booking({
      id: "b3000000-0000-0000-0000-000000000000",
      reference: "B3000000",
      status: "cancelled",
    }),
    booking({ id: "bx000000-0000-0000-0000-000000000000", reference: "BX000000", tenant_id: "t2" }),
  ];
  const inserted: NewReservation[] = [];
  const requests: {
    tenantId: string;
    reservationId: string;
    reason: string | null;
    channel: string;
    category?: string | null;
  }[] = [];
  const tokenHashes: Record<string, string> = {};
  const cancelled: { id: string; channel: string; category: string | null }[] = [];
  const store: ToolStore = {
    async getRoom(id) {
      const r = ROOMS.find((x) => x.id === id);
      return r
        ? {
            id: r.id,
            tenant_id: r.tenant_id,
            property_id: r.property_id,
            name: r.name,
            capacity: r.capacity,
            status: r.status,
            active: r.active,
            rate_group_id: r.rate_group_id,
          }
        : null;
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
      return opts.busy ?? [];
    },
    async countActiveRooms() {
      return 10;
    },
    async getRate(id) {
      return RATES[id] ?? null;
    },
    async getActiveRules() {
      return [];
    },
    async getActiveGifts() {
      return [];
    },
    async getExtras() {
      return [];
    },
    async findMember() {
      return null;
    },
    async findOrCreateCustomer() {
      return "c1";
    },
    async findPromoCode() {
      return null;
    },
    async claimPromoCode() {
      return false;
    },
    async insertReservation(r) {
      inserted.push(r);
      return { id: "c0ffee00-1111-2222-3333-444455556666" };
    },
    async insertExtras() {},
    async listRooms(tenantId) {
      return ROOMS.filter((r) => r.tenant_id === tenantId);
    },
    async findBookingsByEmail(tenantId, email) {
      const mail = email.trim().toLowerCase();
      return bookings.filter((b) => b.tenant_id === tenantId && b.guest_email === mail);
    },
    async listExtras() {
      return EXTRAS;
    },
    async findBookingByReference(tenantId, reference) {
      return bookings.find((b) => b.tenant_id === tenantId && b.reference === reference) ?? null;
    },
    async getBookingById(tenantId, id) {
      return bookings.find((b) => b.tenant_id === tenantId && b.id === id) ?? null;
    },
    async createCancellationRequest(tenantId, reservationId, reason, channel, category) {
      const existing = requests.findIndex((r) => r.reservationId === reservationId);
      if (existing >= 0) return { id: `req-${existing}`, created: false };
      requests.push({
        tenantId,
        reservationId,
        reason,
        channel,
        ...(category ? { category } : {}),
      });
      return { id: `req-${requests.length - 1}`, created: true };
    },
    async cancelBooking(tenantId, id, channel, category) {
      const b = bookings.find((x) => x.tenant_id === tenantId && x.id === id);
      if (!b) throw new Error("Reserva no encontrada");
      b.status = "cancelled";
      cancelled.push({ id, channel, category });
      return { refund: b.deposit_paid ? b.deposit_amount : 0 };
    },
    async setAccessTokenHash(_t, id, hash) {
      tokenHashes[id] = hash;
    },
  };
  return { store, inserted, requests, tokenHashes, cancelled };
}
