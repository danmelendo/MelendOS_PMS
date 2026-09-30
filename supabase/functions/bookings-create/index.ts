// POST /bookings-create
// { room_id, check_in, check_out, guests, payment_mode?, customer?, extras? }
//
// Creates a *pending* reservation priced on the server (never confirmed here).
// Anonymous visitors must send guest details; a signed-in guest (Authorization:
// Bearer <user JWT>) books on their member account.
import { adminClient, clientIp, corsHeaders, json, overLimit, tooMany } from "../_shared/http.ts";
import { BookingError, createBookingDraft } from "../_shared/tools/bookings.ts";
import { supabaseBookingStore } from "../_shared/tools/supabase-store.ts";

const STATUS: Record<BookingError["code"], number> = {
  invalid: 400,
  not_found: 404,
  unavailable: 409,
  capacity: 422,
  unpriced: 422,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const db = adminClient();
  // A user JWT is optional; the publishable key alone means anonymous.
  let userId: string | null = null;
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (token && token.split(".").length === 3) {
    const { data } = await db.auth.getUser(token);
    userId = data.user?.id ?? null;
  }

  // Each pending booking holds its room: without a limit a script could block
  // a whole hotel. 10 an hour per IP is plenty for a person booking.
  const ip = clientIp(req);
  if (ip && (await overLimit(db, `bookings:${ip}`, 10, 3600))) return tooMany();

  try {
    const draft = await createBookingDraft(supabaseBookingStore(db), body, {
      userId,
      channel: userId ? "member" : "public",
    });
    return json(draft, 201);
  } catch (e) {
    if (e instanceof BookingError) return json({ error: e.message, code: e.code }, STATUS[e.code]);
    const message = (e as Error).message;
    if (/acaba de ocuparse/.test(message))
      return json({ error: message, code: "unavailable" }, 409);
    console.error(`bookings-create failed: ${message}`);
    return json({ error: "No se pudo crear la reserva" }, 500);
  }
});
