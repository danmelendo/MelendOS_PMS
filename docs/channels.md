# Distribution channels (OTAs, channel managers, tour operators)

The PMS talks to every channel through one neutral contract. A connection to a
specific provider (Booking.com, Expedia, a channel manager such as SiteMinder
or Channex, a tour operator or bed bank such as Hotelbeds) is an **adapter**
that translates between that provider's API and this contract. Code:
`supabase/functions/_shared/channels/`.

Channels belong to the **Distribución** package (module `channels`).

## Set-up

A hotel admin connects a channel in the panel (**Admin → Canales**): name, kind
(OTA, channel manager, tour operator), provider and commission. The panel shows
once:

- the **webhook URL**: `https://<project>.supabase.co/functions/v1/channel-webhook?channel=<id>`
- the **signing secret** (`dsc_…`, kept in Supabase Vault).

Each of the hotel's room types gets a channel code (editable in "Tipos de
habitación"); only mapped room types are sold on that channel.

## Inbound: bookings

`POST` to the webhook URL with a JSON body and the header
`X-Signature: <hex HMAC-SHA256 of the raw body with the secret>`.

```json
{
  "event": "reservation.created",
  "external_ref": "BDC-4471122",
  "room_code": "DELUXE",
  "check_in": "2026-11-06",
  "check_out": "2026-11-08",
  "guests": 2,
  "guest": { "name": "Emma Schneider", "email": "emma@example.com", "phone": "+49 …" },
  "total": 276.0,
  "currency": "EUR",
  "paid_to_channel": true,
  "notes": "Late arrival"
}
```

- `event`: `reservation.created`, `reservation.modified` or
  `reservation.cancelled` (a cancellation only needs `external_ref`).
- `external_ref`: the channel's booking id, the same in every event of a
  booking. Events are **idempotent**: a replayed event changes nothing.
- `total`: the price agreed on the channel. The commission is stored on the
  booking (`channel_commission`).
- `paid_to_channel`: the guest paid the channel (it pays the hotel later);
  otherwise the guest pays at the hotel.

Responses: `200` with `{ result, reservation_id, reference }` (`result`:
created, modified, cancelled, duplicate, ignored); `401` bad signature; `400`
invalid body; `422` unmapped room code; `409` no room of that type free
(oversold) or channel paused. Every call is in the channel's message log.

Bookings from channels are confirmed, get a free room of the mapped type and
are recorded as `created_by_role = 'ota'` or `'tour_operator'`.

## Outbound: availability (ARI)

Every change to a booking queues an availability update for each active
channel (`channel_outbox`). `channels-dispatch` sends, per channel and mapped
room type, the free rooms and the average price per night for the dates that
changed:

```json
{
  "event": "ari.availability",
  "room_code": "DELUXE",
  "nights": [{ "date": "2026-11-06", "available": 1, "price": 138 }]
}
```

It runs from the panel ("Enviar disponibilidad") and can be scheduled with the
service key. Only the **demo** adapter exists today; other providers answer
"adaptador pendiente" until that connection is contracted.

## Demo

In the demo, "Simular reserva" plays the channel: it builds a fictitious
booking for a mapped room type and posts it, signed, to the webhook.

## Test

- Unit: `supabase/functions/_shared/channels/channels.test.ts`.
- End to end against the demo project: `node --env-file=.env scripts/e2e-channels.mjs`.
