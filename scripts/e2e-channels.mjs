// End-to-end check of the distribution channels against the demo project: an
// admin connects a channel, the channel sends signed bookings (create, replay,
// modify, cancel), availability goes out through the outbox, and everything
// is in the channel's message log. Test data is removed at the end.
// Usage: node --env-file=.env scripts/e2e-channels.mjs
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env;
const service = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!cond) failures++;
};
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function signIn(email) {
  const { data, error } = await service.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const c = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
  const { error: e2 } = await c.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (e2) throw e2;
  return c;
}

let channelId = null;
let admin = null;
const EMAIL = "channel-e2e@example.com";
try {
  const { data: tenant } = await service
    .from("tenants")
    .select("id")
    .eq("slug", "hotel-lumen")
    .single();
  // Two room types that have rooms that sleep two.
  const { data: rooms } = await service
    .from("rooms")
    .select("rate_group_id")
    .eq("tenant_id", tenant.id)
    .eq("active", true)
    .gte("capacity", 2)
    .not("rate_group_id", "is", null);
  const groups = [...new Set(rooms.map((r) => r.rate_group_id))].slice(0, 2);
  const roomMap = Object.fromEntries(groups.map((g, i) => [`E2E-${i}`, g]));
  // Channels are set up by Melend/OS support (platform role), not by the hotel.
  admin = await signIn("soporte@demostays.example");
  const reception = await signIn("recepcion@lumen.demostays.example");
  const management = await signIn("admin@lumen.demostays.example");

  const denied = await reception.rpc("create_channel", {
    p_tenant: tenant.id,
    p_kind: "ota",
    p_provider: "demo",
    p_name: "No",
    p_room_map: roomMap,
  });
  check("reception cannot connect channels", !!denied.error, denied.error?.message);
  const byManagement = await management.rpc("create_channel", {
    p_tenant: tenant.id,
    p_kind: "ota",
    p_provider: "demo",
    p_name: "No",
    p_room_map: roomMap,
  });
  check("hotel management cannot either", !!byManagement.error, byManagement.error?.message);
  const { data: ch, error } = await admin.rpc("create_channel", {
    p_tenant: tenant.id,
    p_kind: "ota",
    p_provider: "demo",
    p_name: "OTA e2e",
    p_commission: 15,
    p_room_map: roomMap,
  });
  if (error) throw error;
  channelId = ch.id;
  check(
    "support connects a channel and gets its secret once",
    /^dsc_[0-9a-f]{48}$/.test(ch.secret),
  );

  const post = async (payload, secret = ch.secret) => {
    const body = JSON.stringify(payload);
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    const res = await fetch(`${SUPABASE_URL}/functions/v1/channel-webhook?channel=${channelId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Signature": sig },
      body,
    });
    return { status: res.status, body: await res.json() };
  };
  const created = {
    event: "reservation.created",
    external_ref: `E2E-${Date.now()}`,
    room_code: "E2E-0",
    check_in: day(380),
    check_out: day(382),
    guests: 2,
    guest: { name: "Prueba Canal", email: EMAIL },
    total: 240,
    paid_to_channel: true,
  };

  const forged = await post(created, "dsc_wrong");
  check("a wrong signature is refused", forged.status === 401, `HTTP ${forged.status}`);

  const first = await post(created);
  check(
    "a booking from the channel is created",
    first.status === 200 && first.body.result === "created",
    JSON.stringify(first.body),
  );
  const id = first.body.reservation_id;
  const { data: row } = await service
    .from("reservations")
    .select("status, created_by_role, channel_id, total, channel_commission, paid_amount")
    .eq("id", id)
    .single();
  check(
    "confirmed, channel price, commission and prepaid",
    row?.status === "confirmed" &&
      row.created_by_role === "ota" &&
      Number(row.total) === 240 &&
      Number(row.channel_commission) === 36 &&
      Number(row.paid_amount) === 240,
    JSON.stringify(row),
  );

  const replay = await post(created);
  check(
    "a replayed event changes nothing",
    replay.body.result === "duplicate" && replay.body.reservation_id === id,
  );

  const modified = await post({
    ...created,
    event: "reservation.modified",
    check_out: day(383),
    total: 330,
  });
  check(
    "the channel modifies it",
    modified.body.result === "modified",
    JSON.stringify(modified.body),
  );

  const { count: pending } = await service
    .from("channel_outbox")
    .select("id", { count: "exact", head: true })
    .eq("channel_id", channelId)
    .eq("status", "pending");
  check(
    "availability changes are queued for the channel",
    (pending ?? 0) > 0,
    `${pending} pending`,
  );
  const { data: sent, error: dispatchError } = await admin.functions.invoke("channels-dispatch", {
    body: { tenant_id: tenant.id },
  });
  check(
    "availability is sent to the channel",
    !dispatchError && sent?.sent > 0,
    JSON.stringify(sent),
  );

  const cancelled = await post({
    event: "reservation.cancelled",
    external_ref: created.external_ref,
  });
  const { data: after } = await service.from("reservations").select("status").eq("id", id).single();
  check(
    "the channel cancels it",
    cancelled.body.result === "cancelled" && after?.status === "cancelled",
  );

  const { data: log } = await admin
    .from("channel_messages")
    .select("direction, event, status")
    .eq("channel_id", channelId)
    .order("id");
  check(
    "everything is in the channel's log",
    log?.filter((m) => m.direction === "in").length >= 4 &&
      log.some((m) => m.direction === "out" && m.status === "ok"),
    log?.map((m) => `${m.direction}:${m.event}:${m.status}`).join(" "),
  );
} catch (e) {
  check("unexpected error", false, e.message);
} finally {
  if (channelId) {
    await service.from("reservations").delete().eq("channel_id", channelId);
    if (admin) await admin.rpc("delete_channel", { p_channel: channelId });
  }
  await service.from("customers").delete().eq("email", EMAIL);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
