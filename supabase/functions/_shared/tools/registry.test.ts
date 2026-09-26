import { describe, expect, it } from "vitest";
import { fakeStore } from "./testing.ts";
import { referenceOf, runTool, toolSchemas, type ToolContext } from "./registry.ts";

const NOW = new Date("2026-09-25T10:00:00Z");

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
    expect(data.results[0]).toMatchObject({ price_total: 160, price_per_night: 80 });
    expect(data.results[0]).not.toHaveProperty("deposit");
    expect(data.payment_options).toEqual(["Pago online al reservar", "Pago en el hotel"]);
    expect(data.cancellation_policy).toMatch(/^Cancelación gratuita hasta 2 días antes/);
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
    expect(q).toMatchObject({
      total: 200,
      nights: 2,
      available: false,
      free_cancellation_until: "2026-09-29T13:00:00.000Z",
    });
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
    expect(d).toMatchObject({
      status: "pending",
      payment_mode: "prepay",
      reference: "C0FFEE00",
      total: 200,
      to_pay_online_now: 200,
    });
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
    expect(link).toMatchObject({ reference: "B1000000", amount: 200 });
    expect(link.payment_url).toMatch(
      new RegExp(`^https://hotel\\.example/web/checkout/${id}\\?t=[0-9a-f]{48}$`),
    );
    expect(tokenHashes[id]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never for bookings paid at the hotel", async () => {
    const { store } = fakeStore();
    const b = await store.getBookingById("t1", "b1000000-0000-0000-0000-000000000000");
    Object.assign(b!, { payment_mode: "at_hotel", deposit_amount: 0 });
    expect(
      await runTool("create_payment_link", { reservation_id: b!.id }, store, ctx),
    ).toMatchObject({ ok: false, error: { code: "conflict" } });
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

  it("records why the guest cancels, from a fixed list", async () => {
    const { store, requests } = fakeStore();
    const input = { reference: "B2000000", email: "laura@example.com" };
    ok(await runTool("request_cancellation", { ...input, reason_category: "work" }, store, ctx));
    expect(requests[0]).toMatchObject({ category: "work" });
    expect(
      await runTool("request_cancellation", { ...input, reason_category: "bored" }, store, ctx),
    ).toMatchObject({ ok: false, error: { code: "invalid" } });
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
