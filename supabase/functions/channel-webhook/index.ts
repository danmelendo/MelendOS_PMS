// POST /channel-webhook?channel=<id>
// Header X-Signature: hex HMAC-SHA256 of the raw body with the channel secret.
//
// Bookings from a distribution channel (OTA, channel manager, tour operator)
// in the neutral contract of _shared/channels/contract.ts (docs/channels.md).
// Idempotent per channel booking id. Everything is logged for the panel.
import { adminClient, json } from "../_shared/http.ts";
import { channelEvent, verifySignature } from "../_shared/channels/contract.ts";
import { applyChannelEvent, ChannelError } from "../_shared/channels/inbound.ts";
import { supabaseChannelStore } from "../_shared/channels/supabase-store.ts";

const STATUS: Record<ChannelError["code"], number> = {
  invalid: 400,
  paused: 409,
  unmapped_room: 422,
  no_availability: 409,
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const channelId = new URL(req.url).searchParams.get("channel") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(channelId)) return json({ error: "Unknown channel" }, 404);

  const db = adminClient();
  const store = supabaseChannelStore(db);
  const channel = await store.getChannel(channelId);
  if (!channel) return json({ error: "Unknown channel" }, 404);
  const { data: enabled } = await db.rpc("tenant_feature", {
    p_tenant: channel.tenant_id,
    p_feature: "channels",
  });
  if (enabled !== true) return json({ error: "Distribution is not enabled" }, 403);

  const body = await req.text();
  const { data: secret } = await db.rpc("channel_secret", { p_channel: channel.id });
  if (!secret || !(await verifySignature(String(secret), body, req.headers.get("X-Signature")))) {
    return json({ error: "Bad signature" }, 401);
  }

  const log = (m: Parameters<typeof store.logMessage>[0]) => store.logMessage(m).catch(() => {});
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    await log({
      tenant_id: channel.tenant_id,
      channel_id: channel.id,
      direction: "in",
      event: "invalid",
      status: "error",
      detail: "Invalid JSON",
    });
    return json({ error: "Invalid JSON" }, 400);
  }
  const parsed = channelEvent.safeParse(raw);
  const event = (raw as { event?: string })?.event ?? "invalid";
  const ref = (raw as { external_ref?: string })?.external_ref ?? null;
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    await log({
      tenant_id: channel.tenant_id,
      channel_id: channel.id,
      direction: "in",
      event,
      external_ref: ref,
      status: "error",
      detail,
      payload: raw,
    });
    return json({ error: detail }, 400);
  }

  try {
    const out = await applyChannelEvent(store, channel, parsed.data);
    const reference = out.reservation_id ? await store.reference(out.reservation_id) : null;
    await log({
      tenant_id: channel.tenant_id,
      channel_id: channel.id,
      direction: "in",
      event,
      external_ref: ref,
      reservation_id: out.reservation_id,
      status: "ok",
      detail: out.result,
      payload: raw,
    });
    return json({ ...out, reference });
  } catch (e) {
    const code = e instanceof ChannelError ? e.code : null;
    await log({
      tenant_id: channel.tenant_id,
      channel_id: channel.id,
      direction: "in",
      event,
      external_ref: ref,
      status: "error",
      detail: (e as Error).message,
      payload: raw,
    });
    if (code) return json({ error: (e as Error).message, code }, STATUS[code]);
    console.error(`channel-webhook failed: ${(e as Error).message}`);
    return json({ error: "Internal error" }, 500);
  }
});
