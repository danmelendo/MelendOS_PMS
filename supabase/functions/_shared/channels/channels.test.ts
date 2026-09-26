import { describe, expect, it } from "vitest";
import { fakeStore } from "../tools/testing.ts";
import { channelEvent, signBody, verifySignature } from "./contract.ts";
import {
  applyChannelEvent,
  type ChannelBooking,
  type ChannelBookingRow,
  type ChannelInfo,
  type ChannelStore,
} from "./inbound.ts";
import { adapterFor, buildAri } from "./outbound.ts";

const channel: ChannelInfo = {
  id: "ch1",
  tenant_id: "t1",
  kind: "ota",
  provider: "demo",
  name: "OTA de prueba",
  status: "active",
  commission_pct: 15,
  room_map: { DBL: "rg-std", SUITE: "rg-suite" },
};

function channelStore(busy: { room_id: string; start_at: string; end_at: string }[] = []) {
  const { store } = fakeStore({ busy });
  const bookings: (ChannelBookingRow & ChannelBooking & { cancellation_reason?: string })[] = [];
  const s: ChannelStore = {
    getTenantSettings: store.getTenantSettings,
    getBusyWindows: store.getBusyWindows,
    findOrCreateCustomer: async () => "c1",
    listRooms: store.listRooms,
    async findChannelBooking(channelId, ref) {
      return bookings.find((b) => b.channel_id === channelId && b.external_ref === ref) ?? null;
    },
    async insertChannelBooking(row) {
      const id = `res-${bookings.length + 1}`;
      bookings.push({ ...row, id });
      return { id };
    },
    async updateChannelBooking(id, patch) {
      Object.assign(bookings.find((b) => b.id === id)!, patch);
    },
  };
  return { s, bookings };
}

const created = {
  event: "reservation.created",
  external_ref: "OTA-1",
  room_code: "DBL",
  check_in: "2026-10-01",
  check_out: "2026-10-03",
  guests: 2,
  guest: { name: "Emma Schneider", email: "emma@example.com" },
  total: 250,
  paid_to_channel: true,
};
const parse = (x: unknown) => channelEvent.parse(x);

describe("channel contract", () => {
  it("signs and verifies bodies with the channel secret", async () => {
    const body = JSON.stringify(created);
    const sig = await signBody("dsc_secret", body);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifySignature("dsc_secret", body, sig)).toBe(true);
    expect(await verifySignature("dsc_secret", body + " ", sig)).toBe(false);
    expect(await verifySignature("other", body, sig)).toBe(false);
    expect(await verifySignature("dsc_secret", body, null)).toBe(false);
  });

  it("requires the stay for new bookings, only the id to cancel", () => {
    expect(channelEvent.safeParse({ ...created, room_code: undefined }).success).toBe(false);
    expect(
      channelEvent.safeParse({ event: "reservation.cancelled", external_ref: "OTA-1" }).success,
    ).toBe(true);
    expect(channelEvent.safeParse({ ...created, check_out: "2026-10-01" }).success).toBe(false);
  });
});

describe("bookings from a channel", () => {
  it("creates a confirmed booking with the channel's price and commission, once", async () => {
    const { s, bookings } = channelStore();
    const first = await applyChannelEvent(s, channel, parse(created));
    expect(first).toEqual({ result: "created", reservation_id: "res-1" });
    expect(bookings[0]).toMatchObject({
      tenant_id: "t1",
      room_id: "r-101",
      status: "confirmed",
      created_by_role: "ota",
      total: 250,
      paid_amount: 250,
      payment_mode: "prepay",
      channel_commission: 37.5,
      external_ref: "OTA-1",
      start_at: "2026-10-01T13:00:00.000Z",
    });
    // The channel resends the same event: nothing changes.
    expect(await applyChannelEvent(s, channel, parse(created))).toEqual({
      result: "duplicate",
      reservation_id: "res-1",
    });
    expect(bookings).toHaveLength(1);
  });

  it("modifies dates and price, moving room only if it has to", async () => {
    const { s, bookings } = channelStore();
    await applyChannelEvent(s, channel, parse(created));
    const res = await applyChannelEvent(
      s,
      channel,
      parse({ ...created, event: "reservation.modified", check_out: "2026-10-04", total: 360 }),
    );
    expect(res.result).toBe("modified");
    expect(bookings[0]).toMatchObject({ room_id: "r-101", total: 360 });
  });

  it("cancels, and ignores cancellations of unknown bookings", async () => {
    const { s, bookings } = channelStore();
    await applyChannelEvent(s, channel, parse(created));
    const cancel = parse({ event: "reservation.cancelled", external_ref: "OTA-1" });
    expect(await applyChannelEvent(s, channel, cancel)).toMatchObject({ result: "cancelled" });
    expect(bookings[0]).toMatchObject({
      status: "cancelled",
      cancellation_reason: "Cancelada en OTA de prueba",
    });
    expect(
      await applyChannelEvent(
        s,
        channel,
        parse({ event: "reservation.cancelled", external_ref: "OTA-9" }),
      ),
    ).toEqual({ result: "ignored", reservation_id: null });
  });

  it("refuses unmapped room types, full hotels and paused channels", async () => {
    const full = [
      { room_id: "r-101", start_at: "2026-10-01T13:00:00Z", end_at: "2026-10-03T10:00:00Z" },
    ];
    const { s } = channelStore(full);
    await expect(
      applyChannelEvent(s, channel, parse({ ...created, room_code: "XXX" })),
    ).rejects.toMatchObject({ code: "unmapped_room" });
    await expect(applyChannelEvent(s, channel, parse(created))).rejects.toMatchObject({
      code: "no_availability",
    });
    await expect(
      applyChannelEvent(s, { ...channel, status: "paused" }, parse(created)),
    ).rejects.toMatchObject({ code: "paused" });
  });

  it("tour operators' bookings are recorded as such, paid at the hotel if not prepaid", async () => {
    const { s, bookings } = channelStore();
    await applyChannelEvent(
      s,
      { ...channel, kind: "tour_operator" },
      parse({ ...created, paid_to_channel: false }),
    );
    expect(bookings[0]).toMatchObject({
      created_by_role: "tour_operator",
      payment_mode: "at_hotel",
      paid_amount: 0,
    });
  });
});

describe("availability sent to channels", () => {
  it("sends free rooms and price per night for each mapped room type", async () => {
    const busy = [
      { room_id: "r-201", start_at: "2026-10-01T13:00:00Z", end_at: "2026-10-02T10:00:00Z" },
    ];
    const { store } = fakeStore({ busy });
    const ari = await buildAri(
      store,
      channel,
      "2026-10-01",
      "2026-10-03",
      new Date("2026-09-25T10:00:00Z"),
    );
    expect(ari).toEqual([
      {
        event: "ari.availability",
        room_code: "DBL",
        nights: [
          { date: "2026-10-01", available: 1, price: 100 },
          { date: "2026-10-02", available: 1, price: 100 },
        ],
      },
      {
        event: "ari.availability",
        room_code: "SUITE",
        nights: [
          { date: "2026-10-01", available: 0, price: null },
          { date: "2026-10-02", available: 1, price: 200 },
        ],
      },
    ]);
    expect(await adapterFor("demo").send(channel, ari)).toMatchObject({ ok: true });
    expect(await adapterFor("booking_com").send(channel, ari)).toMatchObject({ ok: false });
  });
});
