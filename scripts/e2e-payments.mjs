// End-to-end check of the deployed payment functions against the demo project.
// The Redsys notification is signed with Node's OpenSSL (not our own 3DES), so
// this independently verifies the deployed implementation. Test reservations
// are removed at the end.
// Usage: node --env-file=.env scripts/e2e-payments.mjs
import { createCipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env;
// Redsys test-environment key, the same one seed-auth.mjs stores in Vault.
const TEST_KEY = process.env.REDSYS_TEST_SECRET_KEY;
if (!TEST_KEY) throw new Error("REDSYS_TEST_SECRET_KEY is required");
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const fn = (name, qs = "") => `${SUPABASE_URL}/functions/v1/${name}${qs}`;
let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!cond) failures++;
};

function redsysSign(order, paramsB64) {
  const padded = Buffer.alloc(Math.ceil(Buffer.byteLength(order) / 8) * 8);
  padded.write(order);
  const c = createCipheriv("des-ede3-cbc", Buffer.from(TEST_KEY, "base64"), Buffer.alloc(8));
  c.setAutoPadding(false);
  const key = Buffer.concat([c.update(padded), c.final()]);
  return createHmac("sha256", key).update(paramsB64).digest("base64");
}

async function notify(tenant, order, cents, response = "0000", signature) {
  const params = Buffer.from(
    JSON.stringify({ Ds_Order: order, Ds_Amount: String(cents), Ds_Response: response }),
  ).toString("base64");
  const body = new URLSearchParams({
    Ds_SignatureVersion: "HMAC_SHA256_V1",
    Ds_MerchantParameters: params,
    Ds_Signature: signature ?? redsysSign(order, params),
  });
  const res = await fetch(fn("payments-notify", `?tenant=${tenant}&provider=redsys`), {
    method: "POST",
    body,
  });
  return { status: res.status, body: await res.json() };
}

// The demo is live (simulated bookings months ahead): take the first night
// from dayOffset on when the room is free, with margin for the cleaning gap.
async function freeNight(roomId, dayOffset) {
  for (let d = dayOffset; d < dayOffset + 300; d++) {
    const start = new Date(Date.now() + d * 86_400_000);
    start.setUTCHours(13, 0, 0, 0);
    const end = new Date(start.getTime() + 21 * 3_600_000);
    const { count } = await admin
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .not("status", "in", "(cancelled,rejected,no_show)")
      .lt("start_at", new Date(end.getTime() + 3 * 3_600_000).toISOString())
      .gt("end_at", new Date(start.getTime() - 3 * 3_600_000).toISOString());
    if (!count) return { start, end };
  }
  throw new Error("No free night for the test in the next 300 days");
}

// Each test booking gets an access token, like the ones the web creates
// (only its hash is stored); payments-create requires it.
const tokens = new Map();
const sha256 = (t) => createHash("sha256").update(t).digest("hex");

async function pendingReservation(tenant, roomId, dayOffset) {
  const { start, end } = await freeNight(roomId, dayOffset);
  const token = randomBytes(24).toString("hex");
  const { data, error } = await admin
    .from("reservations")
    .insert({
      tenant_id: tenant,
      room_id: roomId,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      total: 100,
      deposit_amount: 30,
      status: "pending",
      created_by_role: "public",
      internal_notes: "e2e-payments test",
      access_token_hash: sha256(token),
    })
    .select("id")
    .single();
  if (error) throw error;
  tokens.set(data.id, token);
  return data.id;
}

async function startPayment(
  reservationId,
  { token = tokens.get(reservationId), returnUrl = "http://localhost:5173/web/checkout" } = {},
) {
  const res = await fetch(fn("payments-create"), {
    method: "POST",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ reservation_id: reservationId, return_url: returnUrl, token }),
  });
  return { status: res.status, body: await res.json() };
}

const created = [];
try {
  const { data: t } = await admin.from("tenants").select("id").eq("slug", "hotel-lumen").single();
  const tenant = t.id;
  const { data: room } = await admin
    .from("rooms")
    .select("id")
    .eq("tenant_id", tenant)
    .eq("name", "104")
    .single();

  // 1. Happy path
  const r1 = await pendingReservation(tenant, room.id, 60);
  created.push(r1);
  const noToken = await startPayment(r1, { token: "adivinado" });
  check(
    "payments-create refuses a booking without its token",
    noToken.status === 404,
    `HTTP ${noToken.status}`,
  );
  const evil = await startPayment(r1, { returnUrl: "https://evil.example/pago" });
  check(
    "payments-create refuses to return to another site",
    evil.status === 400,
    `HTTP ${evil.status}`,
  );
  const start = await startPayment(r1);
  check(
    "payments-create returns a Redsys form",
    start.status === 200 && start.body.redirect?.kind === "form",
    `HTTP ${start.status}`,
  );
  const params = JSON.parse(
    Buffer.from(start.body.redirect.fields.Ds_MerchantParameters, "base64").toString(),
  );
  check("amount comes from the database (30 € → 3000)", params.DS_MERCHANT_AMOUNT === "3000");
  check(
    "form points at the Redsys test environment",
    start.body.redirect.url.includes("sis-t.redsys.es"),
  );
  check(
    "form signature matches OpenSSL",
    start.body.redirect.fields.Ds_Signature ===
      redsysSign(params.DS_MERCHANT_ORDER, start.body.redirect.fields.Ds_MerchantParameters),
  );
  const order = params.DS_MERCHANT_ORDER;

  const forged = await notify(tenant, order, 3000, "0000", "Zm9yZ2VkIHNpZ25hdHVyZQ==");
  check("forged notification is rejected", forged.status === 400, `HTTP ${forged.status}`);
  const stillPending = await admin.from("reservations").select("status").eq("id", r1).single();
  check("…and the reservation stays pending", stillPending.data.status === "pending");

  const ok = await notify(tenant, order, 3000);
  check(
    "signed notification confirms the payment",
    ok.body.result === "succeeded",
    JSON.stringify(ok.body),
  );
  const after = await admin
    .from("reservations")
    .select("status, deposit_paid, paid_amount")
    .eq("id", r1)
    .single();
  check(
    "reservation is confirmed and paid online",
    after.data.status === "confirmed" &&
      after.data.deposit_paid &&
      Number(after.data.paid_amount) === 30,
    JSON.stringify(after.data),
  );
  const replay = await notify(tenant, order, 3000);
  check("replayed notification is idempotent", replay.body.result === "already_processed");

  // 2. Amount tampering
  const r2 = await pendingReservation(tenant, room.id, 70);
  created.push(r2);
  const start2 = await startPayment(r2);
  const order2 = JSON.parse(
    Buffer.from(start2.body.redirect.fields.Ds_MerchantParameters, "base64").toString(),
  ).DS_MERCHANT_ORDER;
  const cheap = await notify(tenant, order2, 100);
  check("a different amount never confirms", cheap.body.result === "amount_mismatch");

  // 3. Declined card
  const r3 = await pendingReservation(tenant, room.id, 80);
  created.push(r3);
  const start3 = await startPayment(r3);
  const order3 = JSON.parse(
    Buffer.from(start3.body.redirect.fields.Ds_MerchantParameters, "base64").toString(),
  ).DS_MERCHANT_ORDER;
  const declined = await notify(tenant, order3, 3000, "0190");
  const r3row = await admin.from("reservations").select("status").eq("id", r3).single();
  check(
    "declined payment rejects the pending reservation",
    declined.body.result === "failed" && r3row.data.status === "rejected",
  );

  // 4. Already paid reservations cannot start a new payment
  const again = await startPayment(r1);
  check("paid reservation cannot be charged again", again.status === 409, `HTTP ${again.status}`);
} catch (e) {
  check("no unexpected error", false, e.message ?? JSON.stringify(e));
} finally {
  if (created.length) {
    await admin.from("reservations").delete().in("id", created);
  }
  console.log(
    `\n${failures === 0 ? "All checks passed" : `${failures} check(s) failed`}; test data removed.`,
  );
  process.exitCode = failures ? 1 : 0;
}
