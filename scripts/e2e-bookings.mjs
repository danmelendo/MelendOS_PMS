// End-to-end check of the deployed bookings-create function (and its hand-off
// to payments-create) against the demo project. Created reservations are
// removed at the end. Usage: node --env-file=.env scripts/e2e-bookings.mjs
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env;
const password = process.env.DEMO_USERS_PASSWORD ?? "DemoStays!2026";
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!cond) failures++;
};
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function book(body, jwt) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/bookings-create`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const created = [];
try {
  const { data: room } = await admin
    .from("rooms")
    .select("id, tenant_id")
    .eq("name", "303")
    .eq("building", "Albora")
    .single();
  const stay = { room_id: room.id, check_in: day(120), check_out: day(123), guests: 2 };

  const anon = await book({ ...stay, customer: { name: "Prueba E2E", email: "e2e@example.com" } });
  check("anonymous booking creates a pending draft", anon.status === 201, `HTTP ${anon.status}`);
  if (anon.status === 201) created.push(anon.body.reservation_id);
  const row =
    anon.status === 201
      ? (
          await admin
            .from("reservations")
            .select("status, total, deposit_amount, customer_id, created_by_role")
            .eq("id", anon.body.reservation_id)
            .single()
        ).data
      : null;
  check(
    "stored as pending with the server-side price, the whole stay to pay online",
    row?.status === "pending" &&
      Number(row.total) === anon.body.breakdown.total &&
      Number(row.deposit_amount) === anon.body.amount_due_now &&
      anon.body.amount_due_now === anon.body.breakdown.total &&
      row.created_by_role === "public",
    JSON.stringify(row),
  );

  const again = await book({ ...stay, customer: { name: "Otra", email: "otra@example.com" } });
  check(
    "the same room and dates cannot be booked twice",
    again.status === 409,
    `HTTP ${again.status}`,
  );

  const noGuest = await book({ ...stay, check_in: day(130), check_out: day(131) });
  check(
    "anonymous visitors must give name and email",
    noGuest.status === 400,
    `HTTP ${noGuest.status}`,
  );

  const tooMany = await book({
    ...stay,
    check_in: day(140),
    check_out: day(141),
    guests: 9,
    customer: { name: "X Y", email: "x@example.com" },
  });
  check("capacity is enforced", tooMany.status === 422, `HTTP ${tooMany.status}`);

  const guest = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: session } = await guest.auth.signInWithPassword({
    email: "alex@guest.demostays.example",
    password,
  });
  const member = await book(
    { ...stay, check_in: day(150), check_out: day(151), hold: true },
    session.session.access_token,
  );
  check(
    "a signed-in guest books on their member account",
    member.status === 201,
    `HTTP ${member.status}`,
  );
  if (member.status === 201) {
    created.push(member.body.reservation_id);
    const m = (
      await admin
        .from("reservations")
        .select("member_id, is_prebooking, hold_expires_at")
        .eq("id", member.body.reservation_id)
        .single()
    ).data;
    check("…with a 30-minute hold", !!m.member_id && m.is_prebooking && !!m.hold_expires_at);
    const { data: mine } = await guest
      .from("reservations")
      .select("id")
      .eq("id", member.body.reservation_id);
    check("…and can see it through RLS", mine?.length === 1);
  }

  if (anon.status === 201) {
    const pay = await fetch(`${SUPABASE_URL}/functions/v1/payments-create`, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        reservation_id: anon.body.reservation_id,
        return_url: "https://example.test/pago",
      }),
    });
    const payBody = await pay.json();
    const params = JSON.parse(
      Buffer.from(payBody.redirect?.fields?.Ds_MerchantParameters ?? "e30=", "base64").toString(),
    );
    check(
      "the draft can go straight to payment for exactly the total",
      pay.status === 200 &&
        params.DS_MERCHANT_AMOUNT === String(Math.round(anon.body.amount_due_now * 100)),
      `HTTP ${pay.status}`,
    );
  }
} finally {
  if (created.length) await admin.from("reservations").delete().in("id", created);
  await admin
    .from("customers")
    .delete()
    .in("email", ["e2e@example.com", "otra@example.com", "x@example.com"]);
  console.log(
    `\n${failures === 0 ? "All checks passed" : `${failures} check(s) failed`}; test data removed.`,
  );
  process.exitCode = failures ? 1 : 0;
}
