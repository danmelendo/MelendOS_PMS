// POST /channels-dispatch  { tenant_id? }
//
// Sends the queued availability changes (channel_outbox) to each channel
// through its provider's adapter: one ARI message per channel covering the
// dates that changed. Called by staff from the panel ("Enviar ahora", their
// hotel only) or by a scheduled job with the service key (every hotel).
import { adminClient, corsHeaders, json, verifiedUser } from "../_shared/http.ts";
import { adapterFor, buildAri, outboxRange } from "../_shared/channels/outbound.ts";
import { supabaseChannelStore } from "../_shared/channels/supabase-store.ts";

const BATCH = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body: { tenant_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* no body: every hotel (service key only) */
  }

  const db = adminClient();
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const service = bearer && bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let tenantId: string | null = body.tenant_id ?? null;
  if (!service) {
    const { data: auth } =
      bearer.split(".").length === 3 ? await verifiedUser(db, bearer) : { data: null };
    const { data: member } =
      auth?.user && tenantId
        ? await db
            .from("tenant_members")
            .select("role")
            .eq("tenant_id", tenantId)
            .eq("user_id", auth.user.id)
            .maybeSingle()
        : { data: null };
    if (!member) return json({ error: "No autorizado" }, 403);
  } else if (!tenantId) {
    tenantId = null; // every hotel
  }

  const store = supabaseChannelStore(db);
  const rows = await store.pendingOutbox(tenantId, BATCH);
  const byChannel = new Map<string, typeof rows>();
  for (const r of rows) byChannel.set(r.channel_id, [...(byChannel.get(r.channel_id) ?? []), r]);

  let sent = 0;
  let failed = 0;
  for (const [channelId, items] of byChannel) {
    const channel = await store.getChannel(channelId);
    const ids = items.map((i) => i.id);
    if (!channel || channel.status !== "active") {
      await store.markOutbox(ids, "error", "Canal pausado o eliminado");
      failed += ids.length;
      continue;
    }
    const ranges = items.map((i) => outboxRange(i.payload));
    const from = ranges.map((r) => r[0]).sort()[0];
    const to = ranges
      .map((r) => r[1])
      .sort()
      .at(-1)!;
    try {
      const messages = await buildAri(store, channel, from, to);
      const res = await adapterFor(channel.provider).send(channel, messages);
      await store.markOutbox(ids, res.ok ? "sent" : "error", res.ok ? null : res.error);
      await store.logMessage({
        tenant_id: channel.tenant_id,
        channel_id: channel.id,
        direction: "out",
        event: "ari.availability",
        status: res.ok ? "ok" : "error",
        detail: res.ok ? `${from} → ${to} · ${res.detail ?? ""}` : res.error,
        payload: messages,
      });
      if (res.ok) sent += ids.length;
      else failed += ids.length;
    } catch (e) {
      await store.markOutbox(ids, "error", (e as Error).message);
      failed += ids.length;
    }
  }
  return json({ processed: rows.length, sent, failed, channels: byChannel.size });
});
