// What the PMS sends to the channels: availability and price per night for
// each mapped room type (ARI), whenever bookings change. Changes are queued in
// channel_outbox by a database trigger and sent by the channels-dispatch
// function through the provider's adapter.
import { addDays, type Ymd } from "../domain/dates.ts";
import { priceCalendar, type CalendarStore } from "../tools/calendar.ts";
import type { ChannelInfo } from "./inbound.ts";

export interface AriNight {
  date: Ymd;
  /** Free rooms of that type that night. */
  available: number;
  /** Average price of one night in the free rooms (EUR), null when full. */
  price: number | null;
}

export interface AriMessage {
  event: "ari.availability";
  room_code: string;
  nights: AriNight[];
}

/** Availability and prices of every mapped room type over [from, to). */
export async function buildAri(
  store: CalendarStore,
  channel: ChannelInfo,
  from: Ymd,
  to: Ymd,
  now = new Date(),
): Promise<AriMessage[]> {
  const days = Math.max(
    1,
    Math.min(62, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)),
  );
  const out: AriMessage[] = [];
  for (const [roomCode, rateGroupId] of Object.entries(channel.room_map)) {
    const cal = await priceCalendar(
      store,
      { tenantId: channel.tenant_id, rateGroupId, from, days, guests: 1 },
      now,
    );
    out.push({
      event: "ari.availability",
      room_code: roomCode,
      nights: cal.nights.map((n) => ({ date: n.date, available: n.free_rooms, price: n.price })),
    });
  }
  return out;
}

/** The dates a queued change affects, as a [from, to) range. */
export function outboxRange(payload: { from?: string; to?: string }): [Ymd, Ymd] {
  const from = String(payload.from ?? "").slice(0, 10);
  const to = String(payload.to ?? "").slice(0, 10);
  return [from, to > from ? to : addDays(from, 1)];
}

export type SendResult = { ok: true; detail?: string } | { ok: false; error: string };

/** One adapter per provider. Only the demo one exists until a provider is contracted. */
export interface ChannelAdapter {
  send(channel: ChannelInfo, messages: AriMessage[]): Promise<SendResult>;
}

export const ADAPTERS: Record<string, ChannelAdapter> = {
  // The demo channel accepts everything: the message log shows what was sent.
  demo: {
    async send(_channel, messages) {
      const nights = messages.reduce((n, m) => n + m.nights.length, 0);
      return { ok: true, detail: `${messages.length} tipos de habitación, ${nights} noches` };
    },
  },
};

export function adapterFor(provider: string): ChannelAdapter {
  return (
    ADAPTERS[provider] ?? {
      async send() {
        return {
          ok: false,
          error: "Adaptador pendiente: la conexión con este proveedor aún no está contratada",
        };
      },
    }
  );
}
