// Bookings that arrive from a distribution channel. Idempotent per channel and
// channel booking id (external_ref): a replayed event changes nothing. The
// channel's room type code maps to one of the hotel's room types (room_map);
// the booking gets a free room of that type, or is refused (the channel then
// knows it has oversold). Prices are the ones agreed on the channel.
import { zonedHourToUtc } from "../domain/dates.ts";
import { round2 } from "../domain/pricing.ts";
import type { BookingStore } from "../tools/bookings.ts";
import type { CatalogRoom } from "../tools/registry.ts";
import type { ChannelEvent } from "./contract.ts";

export interface ChannelInfo {
  id: string;
  tenant_id: string;
  kind: "ota" | "tour_operator" | "channel_manager";
  provider: string;
  name: string;
  status: "active" | "paused";
  commission_pct: number;
  /** Channel room type code → rate_group_id. */
  room_map: Record<string, string>;
}

export interface ChannelBooking {
  id: string;
  status: string;
  room_id: string;
  start_at: string;
  end_at: string;
}

export interface ChannelBookingRow {
  tenant_id: string;
  room_id: string;
  property_id: string;
  customer_id: string;
  start_at: string;
  end_at: string;
  people: number;
  base_price: number;
  total: number;
  deposit_amount: number;
  deposit_paid: boolean;
  paid_amount: number;
  payment_mode: "prepay" | "at_hotel";
  status: "confirmed";
  created_by_role: "ota" | "tour_operator";
  channel_id: string;
  external_ref: string;
  channel_commission: number;
  internal_notes: string | null;
}

export type ChannelStore = Pick<
  BookingStore,
  "getTenantSettings" | "getBusyWindows" | "findOrCreateCustomer"
> & {
  listRooms(tenantId: string): Promise<CatalogRoom[]>;
  findChannelBooking(channelId: string, externalRef: string): Promise<ChannelBooking | null>;
  insertChannelBooking(row: ChannelBookingRow): Promise<{ id: string }>;
  updateChannelBooking(
    id: string,
    patch: Partial<Omit<ChannelBookingRow, "status">> & {
      status?: "cancelled" | "confirmed";
      cancellation_reason?: string;
    },
  ): Promise<void>;
};

export class ChannelError extends Error {
  constructor(
    readonly code: "invalid" | "paused" | "unmapped_room" | "no_availability",
    message: string,
  ) {
    super(message);
  }
}

export interface ChannelResult {
  result: "created" | "modified" | "cancelled" | "duplicate" | "ignored";
  reservation_id: string | null;
}

async function pickRoom(
  store: ChannelStore,
  channel: ChannelInfo,
  e: ChannelEvent,
  start: Date,
  end: Date,
  keep?: ChannelBooking,
): Promise<CatalogRoom> {
  const rateGroup = channel.room_map[e.room_code!];
  if (!rateGroup) {
    throw new ChannelError("unmapped_room", `Room code ${e.room_code} is not mapped`);
  }
  const [rooms, busy] = await Promise.all([
    store.listRooms(channel.tenant_id),
    store.getBusyWindows(channel.tenant_id, start, end),
  ]);
  const own = (b: { room_id: string; start_at: string; end_at: string }) =>
    !!keep &&
    b.room_id === keep.room_id &&
    Date.parse(b.start_at) === Date.parse(keep.start_at) &&
    Date.parse(b.end_at) === Date.parse(keep.end_at);
  const free = (r: CatalogRoom) =>
    !busy.some(
      (b) =>
        b.room_id === r.id &&
        !own(b) &&
        Date.parse(b.start_at) < end.getTime() &&
        start.getTime() < Date.parse(b.end_at),
    );
  const candidates = rooms.filter(
    (r) =>
      r.active &&
      r.status !== "out_of_service" &&
      r.rate_group_id === rateGroup &&
      r.capacity >= (e.guests ?? 1),
  );
  // Keep the same room when it is still free.
  const room = candidates.find((r) => r.id === keep?.room_id && free(r)) ?? candidates.find(free);
  if (!room) throw new ChannelError("no_availability", "No room of that type is free");
  return room;
}

export async function applyChannelEvent(
  store: ChannelStore,
  channel: ChannelInfo,
  e: ChannelEvent,
): Promise<ChannelResult> {
  if (channel.status !== "active") throw new ChannelError("paused", "Channel paused");
  const existing = await store.findChannelBooking(channel.id, e.external_ref);

  if (e.event === "reservation.cancelled") {
    if (!existing) return { result: "ignored", reservation_id: null };
    if (existing.status === "cancelled")
      return { result: "duplicate", reservation_id: existing.id };
    await store.updateChannelBooking(existing.id, {
      status: "cancelled",
      cancellation_reason: `Cancelada en ${channel.name}`,
    });
    return { result: "cancelled", reservation_id: existing.id };
  }

  const settings = await store.getTenantSettings(channel.tenant_id);
  const start = zonedHourToUtc(e.check_in!, settings.checkin_hour, settings.timezone);
  const end = zonedHourToUtc(e.check_out!, settings.checkout_hour, settings.timezone);
  const total = round2(e.total!);
  const money = {
    base_price: total,
    total,
    deposit_amount: e.paid_to_channel ? total : 0,
    deposit_paid: e.paid_to_channel,
    paid_amount: e.paid_to_channel ? total : 0,
    payment_mode: (e.paid_to_channel ? "prepay" : "at_hotel") as "prepay" | "at_hotel",
    channel_commission: round2((total * channel.commission_pct) / 100),
  };

  if (existing && e.event === "reservation.created") {
    return { result: "duplicate", reservation_id: existing.id };
  }
  if (existing) {
    const same =
      Date.parse(existing.start_at) === start.getTime() &&
      Date.parse(existing.end_at) === end.getTime();
    const room = same ? null : await pickRoom(store, channel, e, start, end, existing);
    await store.updateChannelBooking(existing.id, {
      ...money,
      people: e.guests!,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      ...(room ? { room_id: room.id, property_id: room.property_id } : {}),
      status: "confirmed",
      internal_notes: e.notes ?? null,
    });
    return { result: "modified", reservation_id: existing.id };
  }

  const room = await pickRoom(store, channel, e, start, end);
  const customerId = await store.findOrCreateCustomer(channel.tenant_id, {
    name: e.guest!.name,
    email: e.guest!.email ?? `${channel.provider}-${e.external_ref}@channel.invalid`,
    phone: e.guest!.phone,
  });
  const { id } = await store.insertChannelBooking({
    tenant_id: channel.tenant_id,
    room_id: room.id,
    property_id: room.property_id,
    customer_id: customerId,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    people: e.guests!,
    ...money,
    status: "confirmed",
    created_by_role: channel.kind === "tour_operator" ? "tour_operator" : "ota",
    channel_id: channel.id,
    external_ref: e.external_ref,
    internal_notes: e.notes ?? null,
  });
  return { result: "created", reservation_id: id };
}
