import { describe, expect, it } from "vitest";
import type { NewReservation } from "./bookings.ts";
import {
  referenceOf,
  runTool,
  toolSchemas,
  type BookingLookup,
  type CatalogRoom,
  type ToolContext,
  type ToolStore,
} from "./registry.ts";

const NOW = new Date("2026-09-25T10:00:00Z");

const room = (over: Partial<CatalogRoom>): CatalogRoom => ({
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
  ...over,
});

const ROOMS: CatalogRoom[] = [
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
const RATES: Record<string, { price: number; weekend_price: number | null }> = {
  "rg-std": { price: 100, weekend_price: null },
  "rg-cheap": { price: 80, weekend_price: null },
  "rg-suite": { price: 200, weekend_price: null },
  "rg-x": { price: 10, weekend_price: null },
};

const booking = (over: Partial<BookingLookup>): BookingLookup => ({
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
  deposit_amount: 60,
  room_name: "101",
  property_name: "Hotel Uno",
  guest_email: "laura@example.com",
  ...over,
});

function fakeStore(opts: { busy?: { room_id: string; start_at: string; end_at: string }[] } = {}) {
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
  }[] = [];
  const tokenHashes: Record<string, string> = {};
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
      return { checkin_hour: 15, checkout_hour: 12, deposit_pct: 30, timezone: "Europe/Madrid" };
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
    async insertReservation(r) {
      inserted.push(r);
      return { id: "c0ffee00-1111-2222-3333-444455556666" };
    },
    async insertExtras() {},
    async listRooms(tenantId) {
      return ROOMS.filter((r) => r.tenant_id === tenantId);
    },
    async findBookingByReference(tenantId, reference) {
      return bookings.find((b) => b.tenant_id === tenantId && b.reference === reference) ?? null;
    },
    async getBookingById(tenantId, id) {
      return bookings.find((b) => b.tenant_id === tenantId && b.id === id) ?? null;
    },
    async createCancellationRequest(tenantId, reservationId, reason, channel) {
      const existing = requests.findIndex((r) => r.reservationId === reservationId);
      if (existing >= 0) return { id: `req-${existing}`, created: false };
      requests.push({ tenantId, reservationId, reason, channel });
      return { id: `req-${requests.length - 1}`, created: true };
    },
    async setAccessTokenHash(_t, id, hash) {
      tokenHashes[id] = hash;
    },
  };
  return { store, inserted, requests, tokenHashes };
}

const ctx: ToolContext = {
  tenantId: "t1",
  userId: null,
  channel: "web_chat",
  webUrl: "https://hotel.example",
  now: NOW,
};
const stay = { check_in: "2026-10-01", check_out: "2026-10-03" };

function ok(res: Awaited<ReturnType<typeof runTool>>) {
  if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
  return res.data as any;
}

describe("tool registry", () => {
  it("publishes a JSON Schema for every tool", () => {
    const schemas = toolSchemas();
    expect(schemas.map((s) => s.name)).toEqual([
      "search_availability",
      "get_unit_details",
      "quote_price",
      "create_booking_draft",
      "create_payment_link",
      "get_booking",
      "request_cancellation",
    ]);
    for (const s of schemas) expect(s.input_schema.type).toBe("object");
    const search = schemas[0].input_schema as { required: string[] };
    expect(search.required).toEqual(expect.arrayContaining(["check_in", "check_out", "guests"]));
    // A tenant can never be passed by the model.
    expect(JSON.stringify(schemas)).not.toContain("tenant");
  });

  it("rejects unknown tools and invalid input as data, not exceptions", async () => {
    const { store } = fakeStore();
    expect(await runTool("drop_tables", {}, store, ctx)).toMatchObject({
      ok: false,
      error: { code: "unknown_tool" },
    });
    expect(await runTool("search_availability", { ...stay, guests: 0 }, store, ctx)).toMatchObject({
      ok: false,
      error: { code: "invalid" },
    });
    expect(
      await runTool(
        "search_availability",
        { check_in: "01/10/2026", check_out: "2026-10-03", guests: 2 },
        store,
        ctx,
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid" } });
  });
});

describe("search_availability", () => {
  it("lists free rooms of the caller's tenant only, cheapest first", async () => {
    const { store } = fakeStore();
    const data = ok(await runTool("search_availability", { ...stay, guests: 2 }, store, ctx));
    expect(data.nights).toBe(2);
    expect(data.results.map((r: { room: string }) => r.room)).toEqual(["102", "101", "201"]);
    expect(data.results[0]).toMatchObject({ price_total: 160, price_per_night: 80, deposit: 48 });
    expect(JSON.stringify(data)).not.toContain("Hotel Dos");
  });

  it("filters by guests, category, features, price and busy rooms", async () => {
    const busy = [
      { room_id: "r-102", start_at: "2026-10-01T13:00:00Z", end_at: "2026-10-02T10:00:00Z" },
    ];
    const { store } = fakeStore({ busy });
    const rooms = async (input: object) =>
      ok(
        await runTool("search_availability", { ...stay, guests: 2, ...input }, store, ctx),
      ).results.map((r: { room: string }) => r.room);
    expect(await rooms({})).toEqual(["101", "201"]);
    expect(await rooms({ guests: 3 })).toEqual(["201"]);
    expect(await rooms({ category: "suite" })).toEqual(["201"]);
    expect(await rooms({ features: ["terrace"] })).toEqual(["201"]);
    expect(await rooms({ max_price_per_night: 150 })).toEqual(["101"]);
  });

  it("refuses past dates and overly long stays", async () => {
    const { store } = fakeStore();
    expect(
      await runTool(
        "search_availability",
        { check_in: "2026-09-01", check_out: "2026-09-03", guests: 2 },
        store,
        ctx,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid" },
    });
    expect(
      await runTool(
        "search_availability",
        { check_in: "2026-10-01", check_out: "2026-12-01", guests: 2 },
        store,
        ctx,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid" },
    });
  });
});

describe("room details and quotes", () => {
  it("does not reveal rooms of another tenant", async () => {
    const { store } = fakeStore();
    expect(ok(await runTool("get_unit_details", { room_id: "r-201" }, store, ctx))).toMatchObject({
      room: "201",
      base_price_per_night: 200,
      check_in_time: "15:00",
    });
    expect(await runTool("get_unit_details", { room_id: "r-x1" }, store, ctx)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(
      await runTool("quote_price", { room_id: "r-x1", ...stay, guests: 2 }, store, ctx),
    ).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("quotes a stay and reports whether the room is free", async () => {
    const busy = [
      { room_id: "r-101", start_at: "2026-10-02T13:00:00Z", end_at: "2026-10-04T10:00:00Z" },
    ];
    const { store } = fakeStore({ busy });
    const q = ok(
      await runTool("quote_price", { room_id: "r-101", ...stay, guests: 2 }, store, ctx),
    );
    expect(q).toMatchObject({ total: 200, deposit: 60, nights: 2, available: false });
  });
});

describe("create_booking_draft", () => {
  it("creates a pending booking in the caller's tenant with a manage link", async () => {
    const { store, inserted } = fakeStore();
    const d = ok(
      await runTool(
        "create_booking_draft",
        {
          room_id: "r-101",
          ...stay,
          guests: 2,
          customer: { name: "Laura Gómez", email: "laura@example.com" },
        },
        store,
        ctx,
      ),
    );
    expect(d).toMatchObject({ status: "pending", reference: "C0FFEE00", total: 200, deposit: 60 });
    expect(d.manage_url).toMatch(
      /^https:\/\/hotel\.example\/web\/booking\/c0ffee00-[\w-]+\?t=[0-9a-f]{48}$/,
    );
    expect(inserted[0]).toMatchObject({
      tenant_id: "t1",
      status: "pending",
      created_by_role: "agent",
    });
  });

  it("cannot book a room of another tenant", async () => {
    const { store, inserted } = fakeStore();
    const res = await runTool(
      "create_booking_draft",
      {
        room_id: "r-x1",
        ...stay,
        guests: 2,
        customer: { name: "Laura Gómez", email: "laura@example.com" },
      },
      store,
      ctx,
    );
    expect(res).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(inserted).toHaveLength(0);
  });
});

describe("create_payment_link", () => {
  it("rotates the guest token and links to the checkout", async () => {
    const { store, tokenHashes } = fakeStore();
    const id = "b1000000-0000-0000-0000-000000000000";
    const link = ok(await runTool("create_payment_link", { reservation_id: id }, store, ctx));
    expect(link).toMatchObject({ reference: "B1000000", amount: 60 });
    expect(link.payment_url).toMatch(
      new RegExp(`^https://hotel\\.example/web/checkout/${id}\\?t=[0-9a-f]{48}$`),
    );
    expect(tokenHashes[id]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("only for pending, unpaid, unexpired bookings of the tenant", async () => {
    const { store } = fakeStore();
    const link = (reservation_id: string, c = ctx) =>
      runTool("create_payment_link", { reservation_id }, store, c);
    expect(await link("b2000000-0000-0000-0000-000000000000")).toMatchObject({
      error: { code: "conflict" },
    });
    expect(await link("bx000000-0000-0000-0000-000000000000")).toMatchObject({
      error: { code: "not_found" },
    });

    const expired = fakeStore();
    const b = await expired.store.getBookingById("t1", "b1000000-0000-0000-0000-000000000000");
    Object.assign(b!, { is_prebooking: true, hold_expires_at: "2026-09-25T09:00:00Z" });
    expect(
      await runTool("create_payment_link", { reservation_id: b!.id }, expired.store, ctx),
    ).toMatchObject({ error: { code: "conflict" } });
  });
});

describe("get_booking and request_cancellation", () => {
  it("needs the reference and the matching email", async () => {
    const { store } = fakeStore();
    expect(
      ok(
        await runTool(
          "get_booking",
          { reference: "b1000000", email: "LAURA@example.com " },
          store,
          ctx,
        ),
      ),
    ).toMatchObject({ reference: "B1000000", status: "pending", hotel: "Hotel Uno", total: 200 });

    const wrongEmail = await runTool(
      "get_booking",
      { reference: "B1000000", email: "x@example.com" },
      store,
      ctx,
    );
    const wrongRef = await runTool(
      "get_booking",
      { reference: "FFFFFFFF", email: "laura@example.com" },
      store,
      ctx,
    );
    // Same answer either way, so references cannot be probed.
    expect(wrongEmail).toEqual(wrongRef);
    expect(wrongEmail).toMatchObject({ ok: false, error: { code: "not_found" } });

    const otherTenant = await runTool(
      "get_booking",
      { reference: "BX000000", email: "laura@example.com" },
      store,
      ctx,
    );
    expect(otherTenant).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("files one cancellation request for the hotel to decide", async () => {
    const { store, requests } = fakeStore();
    const input = { reference: "B2000000", email: "laura@example.com", reason: "Cambio de planes" };
    const first = ok(await runTool("request_cancellation", input, store, ctx));
    expect(first).toMatchObject({ status: "pending_hotel_review", already_requested: false });
    expect(requests[0]).toEqual({
      tenantId: "t1",
      reservationId: "b2000000-0000-0000-0000-000000000000",
      reason: "Cambio de planes",
      channel: "web_chat",
    });
    const again = ok(await runTool("request_cancellation", input, store, ctx));
    expect(again).toMatchObject({ already_requested: true, request_id: first.request_id });
  });

  it("refuses bookings that are already closed", async () => {
    const { store, requests } = fakeStore();
    const res = await runTool(
      "request_cancellation",
      { reference: "B3000000", email: "laura@example.com" },
      store,
      ctx,
    );
    expect(res).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(requests).toHaveLength(0);
  });
});

describe("referenceOf", () => {
  it("matches the generated column in the database", () => {
    expect(referenceOf("3f9a21c0-aaaa-bbbb-cccc-000000000000")).toBe("3F9A21C0");
  });
});
