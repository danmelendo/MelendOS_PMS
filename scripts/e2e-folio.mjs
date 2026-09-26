// End-to-end check of the stay's bill against the demo project: ordering a
// service, asking for an extension (stays-extend) and starting the balance
// payment (payments-create, kind "balance"). Test data is removed at the end.
// Usage: node --env-file=.env scripts/e2e-folio.mjs
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env;
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!cond) failures++;
};
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const call = async (fn, body) => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

let reservationId = null;
try {
  const { data: room } = await admin
    .from("rooms")
    .select("id, tenant_id")
    .eq("name", "104")
    .eq("building", "Lumen")
    .single();
  const booked = await call("bookings-create", {
    room_id: room.id,
    check_in: day(330),
    check_out: day(332),
    guests: 2,
    customer: { name: "Prueba Cuenta", email: "folio-e2e@example.com" },
  });
  check("booking created", booked.status === 201, `HTTP ${booked.status}`);
  reservationId = booked.body.reservation_id;
  const token = booked.body.access_token;
  // As if the stay had been paid online through the gateway.
  await admin
    .from("reservations")
    .update({ status: "confirmed", deposit_paid: true, paid_amount: booked.body.amount_due_now })
    .eq("id", reservationId);

  const { data: svc } = await admin
    .from("stay_services")
    .select("id, price")
    .eq("tenant_id", room.tenant_id)
    .eq("category", "laundry")
    .limit(1)
    .single();
  const order = await anon.rpc("order_service", {
    p_reservation_id: reservationId,
    p_token: token,
    p_service_id: svc.id,
    p_qty: 1,
  });
  check("guest orders a service with the booking token", !order.error, order.error?.message);

  const wrong = await call("stays-extend", {
    reservation_id: reservationId,
    new_check_out: day(333),
    token: "guess",
  });
  check("stays-extend refuses a wrong token", wrong.status === 404, `HTTP ${wrong.status}`);
  const ext = await call("stays-extend", {
    reservation_id: reservationId,
    new_check_out: day(333),
    token,
  });
  check(
    "stays-extend prices one more night and files the request",
    ext.status === 201 && ext.body.nights === 1 && ext.body.amount > 0,
    JSON.stringify(ext.body),
  );
  const again = await call("stays-extend", {
    reservation_id: reservationId,
    new_check_out: day(334),
    token,
  });
  check("only one pending extension", again.status === 400, `HTTP ${again.status}`);

  // Reception confirms the order; the balance includes it.
  await admin
    .from("folio_charges")
    .update({ status: "posted" })
    .eq("reservation_id", reservationId);
  const folio = await anon.rpc("get_folio", { p_reservation_id: reservationId, p_token: token });
  const expected = booked.body.breakdown.total + Number(svc.price) - booked.body.amount_due_now;
  check(
    "balance = booking + posted charges - paid",
    Math.abs(folio.data.balance - expected) < 0.01,
    `${folio.data.balance} vs ${expected}`,
  );

  const pay = await call("payments-create", {
    reservation_id: reservationId,
    return_url: "https://example.com/back",
    kind: "balance",
  });
  const { data: payment } = await admin
    .from("payments")
    .select("amount, kind, status")
    .eq("reservation_id", reservationId)
    .single();
  check(
    "balance payment started for exactly the balance",
    pay.status === 200 &&
      payment?.kind === "balance" &&
      Number(payment.amount) === folio.data.balance,
    JSON.stringify(payment),
  );
  const secondPayment = await call("payments-create", {
    reservation_id: reservationId,
    return_url: "https://example.com/back",
  });
  check(
    "no second booking payment on a confirmed stay",
    secondPayment.status === 409,
    `HTTP ${secondPayment.status}`,
  );
} finally {
  if (reservationId) {
    await admin.from("booking_journal").delete().eq("booking_ref", reservationId);
    await admin.from("reservations").delete().eq("id", reservationId);
  }
  await admin.from("customers").delete().eq("email", "folio-e2e@example.com");
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed; test data removed.");
process.exitCode = failures ? 1 : 0;
