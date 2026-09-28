// End-to-end check against the demo project: a promo code applied by the
// deployed booking engine (bookings-create), counted once and refused when used
// up, and the confirmation email queued and processed by guest-emails-dispatch
// (simulated in the demo) with a fresh access link. Everything it creates (a
// code of its own, the bookings) is removed at the end.
// Usage: node --env-file=.env scripts/e2e-promo-emails.mjs
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env;
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!cond) failures++;
};
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function book(body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/bookings-create`, {
    method: "POST",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const created = [];
let promoId = null;
try {
  const { data: room } = await admin
    .from("rooms")
    .select("id, tenant_id")
    .eq("name", "303")
    .eq("building", "Albora")
    .single();
  const code = `E2E${randomUUID().slice(0, 6).toUpperCase()}`;
  const { data: promo, error: promoError } = await admin
    .from("promo_codes")
    .insert({
      tenant_id: room.tenant_id,
      code,
      discount_type: "percent",
      discount_value: 10,
      max_uses: 1,
    })
    .select("id")
    .single();
  if (promoError) throw promoError;
  promoId = promo.id;

  const stay = {
    room_id: room.id,
    check_in: day(140),
    check_out: day(142),
    guests: 2,
    payment_mode: "at_hotel",
    customer: { name: "Prueba E2E", email: "e2e-promo@example.com" },
  };
  const full = await book({ ...stay, check_in: day(150), check_out: day(152) });
  if (full.body.reservation_id) created.push(full.body.reservation_id);
  const withCode = await book({ ...stay, promo_code: code.toLowerCase() });
  if (withCode.body.reservation_id) created.push(withCode.body.reservation_id);
  check("booking with the code is created", withCode.status === 201, `HTTP ${withCode.status}`);
  const b = withCode.body.breakdown ?? {};
  const room2 = (full.body.breakdown?.base ?? 0) + (full.body.breakdown?.dynamicSurcharge ?? 0);
  check(
    "10 % off the room price, computed on the server",
    b.promoCode === code &&
      b.discount > 0 &&
      Math.abs(b.total + b.discount - (b.base + b.dynamicSurcharge + b.extrasTotal)) < 0.01,
    `discount ${b.discount}, total ${b.total} (room without code ${room2})`,
  );
  const { data: row } = await admin
    .from("reservations")
    .select("discount_amount, promo_code_id, total")
    .eq("id", withCode.body.reservation_id)
    .single();
  check(
    "the reservation keeps the discount and the code",
    row?.promo_code_id === promoId && Number(row?.discount_amount) === b.discount,
  );
  const { data: used } = await admin
    .from("promo_codes")
    .select("times_used, archived")
    .eq("id", promoId)
    .single();
  check("the use is counted and the code archived", used?.times_used === 1 && used?.archived);

  const again = await book({ ...stay, check_in: day(160), check_out: day(162), promo_code: code });
  if (again.body.reservation_id) created.push(again.body.reservation_id);
  check(
    "a used-up code is refused",
    again.status === 400,
    `HTTP ${again.status}: ${again.body.error}`,
  );

  // The confirmation email: queued by the trigger and sent (simulated in the
  // demo) by guest-emails-dispatch, which the database calls every minute.
  const { data: queued } = await admin
    .from("guest_emails")
    .select("id, status")
    .eq("reservation_id", withCode.body.reservation_id);
  check("confirmation email queued", queued?.length === 1, JSON.stringify(queued));
  let email = null;
  for (let i = 0; i < 50 && !(email && email.status !== "pending"); i++) {
    const { data } = await admin
      .from("guest_emails")
      .select("status, to_email, error")
      .eq("reservation_id", withCode.body.reservation_id)
      .single();
    email = data;
    if (email?.status === "pending") await sleep(2500);
  }
  check(
    "email processed for the guest",
    ["simulated", "sent"].includes(email?.status) && email?.to_email === "e2e-promo@example.com",
    `${email?.status} ${email?.error ?? ""}`,
  );
  const { count } = await admin
    .from("booking_access_tokens")
    .select("id", { count: "exact", head: true })
    .eq("reservation_id", withCode.body.reservation_id);
  check("the email's link has its own access token", count === 1);
} catch (e) {
  check("no unexpected error", false, e.message);
} finally {
  if (created.length) await admin.from("reservations").delete().in("id", created);
  if (promoId) await admin.from("promo_codes").delete().eq("id", promoId);
  console.log(`Cleaned up ${created.length} reservation(s) and the test code.`);
}
process.exit(failures ? 1 : 0);
