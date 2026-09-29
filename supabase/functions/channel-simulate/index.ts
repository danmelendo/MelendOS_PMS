// POST /channel-simulate  { channel_id }
//
// Demo only (secret DEMO_ACCESS=true): plays the channel's side. Builds a
// plausible booking with fictitious data for one of the mapped room types and
// posts it, signed, to channel-webhook, exactly as an OTA would. Caller: an
// admin of the channel's hotel.
import { adminClient, corsHeaders, json, verifiedUser } from "../_shared/http.ts";
import { signBody } from "../_shared/channels/contract.ts";
import { supabaseChannelStore } from "../_shared/channels/supabase-store.ts";
import { addDays, ymdInZone } from "../_shared/domain/dates.ts";
import { priceCalendar } from "../_shared/tools/calendar.ts";

const NAMES = [
  "Emma Schneider",
  "Lucas Martin",
  "Sofia Rossi",
  "Oliver Smith",
  "Mia Jansen",
  "Hugo Dubois",
  "Lena Fischer",
  "Marco Bianchi",
  "Chloe Wilson",
  "Noah Peeters",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (Deno.env.get("DEMO_ACCESS") !== "true") return json({ error: "Solo en la demo" }, 403);

  const { channel_id } = (await req.json().catch(() => ({}))) as { channel_id?: string };
  const db = adminClient();
  const store = supabaseChannelStore(db);
  const channel = channel_id ? await store.getChannel(channel_id) : null;
  if (!channel) return json({ error: "Canal no encontrado" }, 404);

  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: auth } = jwt.split(".").length === 3 ? await verifiedUser(db, jwt) : { data: null };
  const { data: member } = auth?.user
    ? await db
        .from("tenant_members")
        .select("role")
        .eq("tenant_id", channel.tenant_id)
        .eq("user_id", auth.user.id)
        .maybeSingle()
    : { data: null };
  if (!member || !["admin", "group", "platform"].includes(member.role)) {
    return json({ error: "Solo dirección" }, 403);
  }

  // A room type with free nights some weeks ahead.
  const settings = await store.getTenantSettings(channel.tenant_id);
  const today = ymdInZone(new Date(), settings.timezone);
  const codes = Object.entries(channel.room_map);
  if (!codes.length) return json({ error: "El canal no tiene tipos de habitación asignados" }, 422);
  const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
  for (let attempt = 0; attempt < 8; attempt++) {
    const [roomCode, rateGroupId] = pick(codes);
    const checkIn = addDays(today, 14 + Math.floor(Math.random() * 60));
    const nights = 1 + Math.floor(Math.random() * 4);
    const cal = await priceCalendar(store, {
      tenantId: channel.tenant_id,
      rateGroupId,
      from: checkIn,
      days: nights,
      guests: 2,
    });
    if (cal.nights.length < nights || cal.nights.some((n) => n.price == null)) continue;
    const total = Math.round(cal.nights.reduce((s, n) => s + n.price!, 0) * 0.95);
    const name = pick(NAMES);
    const payload = {
      event: "reservation.created",
      external_ref: `${channel.provider.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
      room_code: roomCode,
      check_in: checkIn,
      check_out: addDays(checkIn, nights),
      guests: 2,
      guest: {
        name,
        email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@guest.channel.example`,
      },
      total,
      currency: "EUR",
      paid_to_channel: Math.random() < 0.5,
      notes: `Reserva de prueba simulada (${channel.name})`,
    };
    const body = JSON.stringify(payload);
    const { data: secret } = await db.rpc("channel_secret", { p_channel: channel.id });
    const res = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/channel-webhook?channel=${channel.id}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": await signBody(String(secret), body),
        },
        body,
      },
    );
    return json({ status: res.status, sent: payload, response: await res.json() });
  }
  return json({ error: "No hay noches libres para simular una reserva" }, 409);
});
