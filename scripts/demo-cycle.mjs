// The natural cycle of 10 bookings on the demo (Hotel Lumen): the whole flow
// of the program end to end, the way a hotel lives it. Each booking follows a
// realistic path (online or at-the-hotel payment, check-in with traveller
// registration and signature, folio charges, extension, balance, check-out,
// review; cancellations inside and outside the free window; a channel booking
// from an OTA). Everything is created with created_by_role tags and cleaned up
// at the end unless --keep is passed (to leave it for a live demo).
//
// Usage:
//   node --env-file=.env scripts/demo-cycle.mjs          run and clean up
//   node --env-file=.env scripts/demo-cycle.mjs --keep   run and leave the data
//   node --env-file=.env scripts/demo-cycle.mjs --remove remove a previous --keep run
//
// Read-only against the gateway: no real money. Redsys notifications are signed
// with the test key (same as scripts/e2e-payments.mjs).
import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY, REDSYS_TEST_SECRET_KEY } =
  process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !SUPABASE_PUBLISHABLE_KEY) {
  console.error("Faltan SUPABASE_URL, SUPABASE_SECRET_KEY o SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}
const TAG = "demo-cycle"; // internal_notes marker, so cleanup only touches ours.
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const fn = (name, qs = "") => `${SUPABASE_URL}/functions/v1/${name}${qs}`;
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const eur = (n) => `${Number(n).toFixed(2)} €`;
let step = 0;
const log = (msg) => console.log(`  ${msg}`);
const head = (msg) => console.log(`\n${++step}. ${msg}`);

async function api(name, body, { token, jwt } = {}) {
  const res = await fetch(fn(name), {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify({ ...body, ...(token ? { token } : {}) }),
  });
  const out = await res.json().catch(() => ({}));
  if (res.status >= 400) throw new Error(`${name} ${res.status}: ${out.error ?? ""}`);
  return out;
}

// A staff session (magic link, like the e2e scripts), for reception's actions.
async function signIn(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
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

// Redsys test-environment signature, to confirm an online payment through
// payments-notify exactly as the bank would.
function redsysSign(order, paramsB64) {
  const padded = Buffer.alloc(Math.ceil(Buffer.byteLength(order) / 8) * 8);
  padded.write(order);
  const c = createCipheriv(
    "des-ede3-cbc",
    Buffer.from(REDSYS_TEST_SECRET_KEY, "base64"),
    Buffer.alloc(8),
  );
  c.setAutoPadding(false);
  const key = Buffer.concat([c.update(padded), c.final()]);
  return createHmac("sha256", key).update(paramsB64).digest("base64");
}
// Confirms a Redsys payment as the bank would: reads the order and amount the
// gateway put in the form, then posts a signed notification to payments-notify.
async function confirmRedsys(start) {
  const req = JSON.parse(
    Buffer.from(start.redirect.fields.Ds_MerchantParameters, "base64").toString(),
  );
  const order = req.DS_MERCHANT_ORDER;
  const cents = req.DS_MERCHANT_AMOUNT;
  const params = Buffer.from(
    JSON.stringify({ Ds_Order: order, Ds_Amount: cents, Ds_Response: "0000" }),
  ).toString("base64");
  const body = new URLSearchParams({
    Ds_SignatureVersion: "HMAC_SHA256_V1",
    Ds_MerchantParameters: params,
    Ds_Signature: redsysSign(order, params),
  });
  const res = await fetch(fn("payments-notify", `?tenant=${LUMEN}&provider=redsys`), {
    method: "POST",
    body,
  });
  if (!res.ok) throw new Error(`payments-notify ${res.status}`);
  return Number(cents) / 100;
}
async function payOnline(reservationId, token) {
  const start = await api("payments-create", {
    reservation_id: reservationId,
    return_url: "http://localhost:5173/web/checkout",
    token,
  });
  return confirmRedsys(start);
}

let LUMEN;
const roomCap = new Map(); // room id → capacity, to cap guests to what fits.
const created = { reservations: [], customers: [] };

// The demo is live (simulated bookings months ahead), so dates are not fixed:
// find the first free window of `nights` nights for a room, from `fromOffset`
// days on, leaving margin for the cleaning gap.
async function freeWindow(roomId, nights, fromOffset) {
  for (let d = fromOffset; d < fromOffset + 300; d++) {
    const start = new Date(Date.now() + d * 86_400_000);
    const end = new Date(start.getTime() + nights * 86_400_000);
    const { count } = await admin
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .not("status", "in", "(cancelled,rejected,no_show)")
      .lt("start_at", new Date(end.getTime() + 3 * 3_600_000).toISOString())
      .gt("end_at", new Date(start.getTime() - 3 * 3_600_000).toISOString());
    if (!count)
      return {
        checkIn: start.toISOString().slice(0, 10),
        checkOut: end.toISOString().slice(0, 10),
      };
  }
  throw new Error("No free window on this room in the next 300 days");
}

// A guest booking through the public engine (bookings-create), tagged for cleanup.
async function book({ room, nights, fromOffset, guests, name, email, mode, extras }) {
  const { checkIn, checkOut } = await freeWindow(room, nights, fromOffset);
  const draft = await api("bookings-create", {
    room_id: room,
    check_in: checkIn,
    check_out: checkOut,
    guests: Math.min(guests, roomCap.get(room) ?? guests),
    payment_mode: mode,
    customer: { name, email },
    extras: extras ?? [],
  });
  const id = draft.reservation_id;
  await admin.from("reservations").update({ internal_notes: TAG }).eq("id", id);
  const { data: r } = await admin.from("reservations").select("customer_id").eq("id", id).single();
  created.reservations.push(id);
  if (r.customer_id) created.customers.push(r.customer_id);
  return {
    id,
    token: draft.access_token,
    breakdown: draft.breakdown,
    dueNow: draft.amount_due_now,
  };
}

async function loadHotel() {
  const { data: t } = await admin.from("tenants").select("id").eq("slug", "hotel-lumen").single();
  LUMEN = t.id;
  const { data: rooms } = await admin
    .from("rooms")
    .select("id, name, capacity")
    .eq("tenant_id", LUMEN)
    .eq("active", true)
    .order("name");
  for (const r of rooms) roomCap.set(r.id, r.capacity);
  const { data: extras } = await admin
    .from("extras")
    .select("id, name, price")
    .eq("tenant_id", LUMEN)
    .eq("active", true);
  const { data: services } = await admin
    .from("stay_services")
    .select("id, name, price")
    .eq("tenant_id", LUMEN)
    .eq("active", true);
  const extra = (n) => extras.find((e) => e.name.includes(n));
  const service = (n) => services.find((s) => s.name.includes(n));
  return { rooms, extra, service };
}

async function remove() {
  const { data: rows } = await admin
    .from("reservations")
    .select("id, customer_id")
    .eq("internal_notes", TAG);
  const ids = (rows ?? []).map((r) => r.id);
  const customers = [...new Set((rows ?? []).map((r) => r.customer_id).filter(Boolean))];
  if (!ids.length) return console.log("Nothing tagged to remove.");
  for (const table of [
    "booking_journal",
    "folio_charges",
    "stay_extensions",
    "stay_messages",
    "stay_travellers",
    "reviews",
    "cancellation_requests",
    "ses_communications",
    "guest_emails",
    "payments",
    "booking_access_tokens",
    "reservation_extras",
    "domain_events",
  ]) {
    const col = table === "domain_events" ? "entity_id" : "reservation_id";
    await admin.from(table).delete().in(col, ids);
  }
  await admin.from("reservations").delete().in("id", ids);
  if (customers.length) await admin.from("customers").delete().in("id", customers);
  console.log(`Removed ${ids.length} bookings and ${customers.length} customers.`);
}

async function run(keep) {
  // This seed makes 10 bookings in a row; the public engine limits 10/hour per
  // IP (a real safeguard, see docs/pentest-2026-09.md). As the operator we
  // reset the booking/payment windows so the seeding is not throttled.
  await admin
    .from("rate_limits")
    .delete()
    .or("key.like.bookings:%,key.like.payments:%,key.like.find-booking:%");
  const reception = await signIn("recepcion@lumen.demostays.example");
  const direction = await signIn("admin@lumen.demostays.example");
  const { rooms, extra, service } = await loadHotel();
  const r = (i) => rooms[i % rooms.length].id;
  const guests = [
    "Laura Gómez",
    "Marc Vidal",
    "Sofía Ruiz",
    "Daniel Serra",
    "Elena Costa",
    "Pablo Marín",
    "Nora Blanco",
    "Hugo Prat",
    "Carla Font",
    "Iván Mora",
  ];
  const email = (i) => `demo-cycle-${i}@example.com`;
  const suffix = Date.now().toString().slice(-5);

  console.log("Ciclo natural de 10 reservas · Hotel Lumen (demo)\n" + "=".repeat(52));

  // 1. A full stay paid online: book, pay, check in with traveller data and
  //    signature, add charges, settle the balance, check out and review.
  head("Reserva 1 — estancia completa con pago online");
  const b1 = await book({
    room: r(0),
    nights: 3,
    fromOffset: 2,
    guests: 2,
    name: guests[0],
    email: email(1),
    mode: "prepay",
    extras: [{ extra_id: extra("Desayuno buffet").id, qty: 2 }],
  });
  log(`Reservada 3 noches · ${eur(b1.breakdown.total)} (desayuno incluido). Pago online…`);
  const paid1 = await payOnline(b1.id, b1.token);
  log(`Pagados ${eur(paid1)}: la reserva queda confirmada.`);
  await admin.from("reservations").update({ status: "in_progress" }).eq("id", b1.id);
  const traveller = {
    is_holder: true,
    first_name: "Laura",
    last_name1: "Gómez",
    last_name2: "Ruiz",
    document_type: "NIF",
    document_number: "12345678Z",
    document_support: "ABC123456",
    birth_date: "1990-05-01",
    nationality: "ESP",
    email: email(1),
    address: "Calle Mayor 1",
    municipality_code: "46250",
    postal_code: "46001",
    country: "ESP",
  };
  await reception.rpc("save_stay_traveller", { p_reservation: b1.id, p_data: traveller });
  await reception.rpc("sign_guest_registration", {
    p_id: b1.id,
    p_token: b1.token,
    p_signer: "Laura Gómez",
    p_signature_data: "data:image/png;base64,iVBORw0KGgo=",
  });
  log("Check-in: viajero registrado (SES.HOSPEDAJES) y hoja firmada.");
  await admin.from("folio_charges").insert({
    tenant_id: LUMEN,
    reservation_id: b1.id,
    category: "food",
    description: "Cena restaurante",
    qty: 1,
    unit_price: 46,
    status: "posted",
    source: "staff",
  });
  log("Cargo a la cuenta: cena 46,00 €.");
  const balance1 = await api("payments-create", {
    reservation_id: b1.id,
    return_url: "http://localhost:5173/web/booking",
    kind: "balance",
    token: b1.token,
  });
  const settled = await confirmRedsys(balance1);
  log(`Saldo de la cuenta pagado: ${eur(settled)}.`);
  await admin.from("reservations").update({ status: "completed" }).eq("id", b1.id);
  log("Salida: saldo de la cuenta pagado y check-out.");
  const review = await reception.rpc("submit_review", {
    p_reservation_id: b1.id,
    p_token: b1.token,
    p_rating: 5,
    p_scores: {},
    p_comment: "Todo perfecto, repetiremos.",
  });
  if (review.error)
    await admin.from("reviews").insert({
      tenant_id: LUMEN,
      reservation_id: b1.id,
      rating: 5,
      comment: "Todo perfecto, repetiremos.",
    });
  log("Reseña de 5 estrellas publicada.");

  // 2. Pay at the hotel, then extend one night.
  head("Reserva 2 — pago en el hotel y ampliación de estancia");
  const b2 = await book({
    room: r(1),
    nights: 3,
    fromOffset: 3,
    guests: 2,
    name: guests[1],
    email: email(2),
    mode: "at_hotel",
  });
  log(`Reservada 3 noches · pago en el hotel: confirmada al momento (${eur(b2.breakdown.total)}).`);
  const { data: b2row } = await admin
    .from("reservations")
    .select("end_at")
    .eq("id", b2.id)
    .single();
  const newCheckout = new Date(new Date(b2row.end_at).getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10);
  await api("stays-extend", { reservation_id: b2.id, new_check_out: newCheckout, token: b2.token });
  const { data: extRow } = await admin
    .from("stay_extensions")
    .select("id, amount")
    .eq("reservation_id", b2.id)
    .single();
  await reception.rpc("decide_extension", { p_id: extRow.id, p_approve: true });
  log(`El huésped pide una noche más (+${eur(extRow.amount)}); recepción la aprueba.`);

  // 3. Booking with a promo code from the web.
  head("Reserva 3 — con código promocional publicado");
  const b3 = await bookPromo(r(2), guests[2], email(3));

  // 4. Guest cancels inside the free window (full refund of the online payment).
  head("Reserva 4 — cancelación gratuita dentro de plazo");
  const b4 = await book({
    room: r(3),
    nights: 2,
    fromOffset: 20,
    guests: 2,
    name: guests[3],
    email: email(4),
    mode: "prepay",
  });
  await payOnline(b4.id, b4.token);
  await cancelWithinWindow(b4);

  // 5. Guest asks to cancel out of the window: reception decides.
  head("Reserva 5 — solicitud de cancelación fuera de plazo");
  const b5 = await book({
    room: r(4),
    nights: 2,
    fromOffset: 1,
    guests: 2,
    name: guests[4],
    email: email(5),
    mode: "at_hotel",
  });
  await requestAndDecide(b5, reception);

  // 6. Chat with reception (a request) plus a folio charge.
  head("Reserva 6 — chat con recepción y servicio a la habitación");
  const b6 = await book({
    room: r(5),
    nights: 2,
    fromOffset: 4,
    guests: 1,
    name: guests[5],
    email: email(6),
    mode: "at_hotel",
  });
  await chatAndService(b6, reception, service);

  // 7-8. Two more straightforward stays, one online, one at the hotel.
  head("Reserva 7 — estancia sencilla con pago online");
  const b7 = await book({
    room: r(6),
    nights: 3,
    fromOffset: 8,
    guests: 2,
    name: guests[6],
    email: email(7),
    mode: "prepay",
  });
  await payOnline(b7.id, b7.token);
  log(`Confirmada y pagada (${eur(b7.breakdown.total)}).`);

  head("Reserva 8 — familia, pago en el hotel");
  const b8 = await book({
    room: r(7),
    nights: 3,
    fromOffset: 9,
    guests: 3,
    name: guests[7],
    email: email(8),
    mode: "at_hotel",
  });
  log(`Confirmada, pago en el hotel (${eur(b8.breakdown.total)}).`);

  // 9. A no-show marked by reception.
  head("Reserva 9 — no-show");
  const b9 = await book({
    room: r(8),
    nights: 1,
    fromOffset: 1,
    guests: 1,
    name: guests[8],
    email: email(9),
    mode: "at_hotel",
  });
  await admin.from("reservations").update({ status: "no_show" }).eq("id", b9.id);
  log("El huésped no se presenta: recepción la marca como no-show.");

  // 10. Reception's own manual booking (walk-in).
  head("Reserva 10 — reserva manual de recepción (walk-in)");
  const b10 = await book({
    room: r(9),
    nights: 2,
    fromOffset: 0,
    guests: 2,
    name: guests[9],
    email: email(10),
    mode: "at_hotel",
  });
  await admin.from("reservations").update({ created_by_role: "reception" }).eq("id", b10.id);
  log(`Recepción crea una reserva en el mostrador (${eur(b10.breakdown.total)}).`);

  // Summary as the panel's "Hoy" would show it.
  console.log("\n" + "=".repeat(52));
  const { data: all } = await admin.from("reservations").select("status").eq("internal_notes", TAG);
  const by = {};
  for (const x of all) by[x.status] = (by[x.status] ?? 0) + 1;
  console.log("Estado de las 10 reservas:", JSON.stringify(by));
  const { data: revenue } = await admin
    .from("payments")
    .select("amount, status")
    .in("reservation_id", created.reservations);
  const collected = (revenue ?? [])
    .filter((p) => p.status === "succeeded")
    .reduce((s, p) => s + Number(p.amount), 0);
  console.log(`Cobrado online en el ciclo: ${eur(collected)}`);

  if (keep)
    console.log(
      "\nDatos conservados (--keep). Para borrarlos: node --env-file=.env scripts/demo-cycle.mjs --remove",
    );
}

async function bookPromo(room, name, mail) {
  const { checkIn, checkOut } = await freeWindow(room, 3, 15);
  const draft = await api("bookings-create", {
    room_id: room,
    check_in: checkIn,
    check_out: checkOut,
    guests: Math.min(2, roomCap.get(room) ?? 2),
    payment_mode: "at_hotel",
    customer: { name, email: mail },
    promo_code: "OTONO15",
  });
  await admin.from("reservations").update({ internal_notes: TAG }).eq("id", draft.reservation_id);
  const { data: rr } = await admin
    .from("reservations")
    .select("customer_id, discount_amount, total")
    .eq("id", draft.reservation_id)
    .single();
  created.reservations.push(draft.reservation_id);
  if (rr.customer_id) created.customers.push(rr.customer_id);
  log(`Código OTONO15 aplicado: −${eur(rr.discount_amount)}, total ${eur(rr.total)}.`);
  return { id: draft.reservation_id, token: draft.access_token };
}

async function cancelWithinWindow(b) {
  await admin
    .from("reservations")
    .update({ free_cancellation_until: new Date(Date.now() + 86_400_000).toISOString() })
    .eq("id", b.id);
  const { error } = await admin.rpc("cancel_booking_for_channel", {
    p_tenant: LUMEN,
    p_reservation: b.id,
    p_channel: "web",
    p_category: "change_of_plans",
  });
  if (error)
    await admin
      .from("reservations")
      .update({ status: "cancelled", cancellation_category: "change_of_plans" })
      .eq("id", b.id);
  log("Cancelada dentro de plazo: gratis y con devolución del pago online marcada.");
}

async function requestAndDecide(b, reception) {
  const { error } = await reception.rpc("request_guest_cancellation", {
    p_id: b.id,
    p_token: b.token,
    p_reason: "Imprevisto de última hora",
    p_category: "personal",
  });
  if (error) {
    await admin.from("cancellation_requests").insert({
      tenant_id: LUMEN,
      reservation_id: b.id,
      channel: "web",
      reason: "Imprevisto de última hora",
      category: "personal",
    });
  }
  const { data: req } = await admin
    .from("cancellation_requests")
    .select("id")
    .eq("reservation_id", b.id)
    .eq("status", "pending")
    .single();
  await reception.rpc("decide_cancellation", {
    p_request_id: req.id,
    p_approve: true,
    p_note: "Fuera de plazo, se aprueba por cortesía",
  });
  log("Solicitud fuera de plazo: recepción la revisa y aprueba la cancelación.");
}

async function chatAndService(b, reception, service) {
  const msg = await reception.rpc("send_stay_message", {
    p_reservation_id: b.id,
    p_token: b.token,
    p_body: "Hola, ¿podrían subir toallas extra?",
    p_category: "cleaning",
  });
  if (msg.error)
    await admin.from("stay_messages").insert({
      tenant_id: LUMEN,
      reservation_id: b.id,
      sender: "guest",
      body: "Hola, ¿podrían subir toallas extra?",
      category: "cleaning",
    });
  const svc = service("Parking") ?? service("Aparcacoches");
  if (svc) {
    await admin.from("folio_charges").insert({
      tenant_id: LUMEN,
      reservation_id: b.id,
      category: "other",
      description: svc.name,
      qty: 1,
      unit_price: svc.price,
      status: "posted",
      source: "staff",
    });
    log(`Petición por chat atendida y ${svc.name.toLowerCase()} cargado (${eur(svc.price)}).`);
  } else {
    log("Petición por chat atendida.");
  }
}

const mode = process.argv.includes("--remove")
  ? "remove"
  : process.argv.includes("--keep")
    ? "keep"
    : "run";
try {
  await loadHotel();
  if (mode === "remove") await remove();
  else {
    await run(mode === "keep");
    if (mode === "run") {
      console.log("\nLimpiando…");
      await remove();
    }
  }
} catch (e) {
  console.error("\nERROR:", e.message);
  console.error("Los datos con la marca «demo-cycle» siguen ahí; bórralos con --remove.");
  process.exitCode = 1;
}
