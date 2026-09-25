// POST /stays-extend  { reservation_id, new_check_out, token? }
//
// A guest asks to stay longer. The guest proves the booking is theirs with the
// booking token (no account) or their session (Authorization: Bearer <JWT>).
// The extra nights are priced on the server and filed for reception to approve;
// nothing changes on the booking here.
import { adminClient, corsHeaders, json } from "../_shared/http.ts";
import { BookingError } from "../_shared/tools/bookings.ts";
import { requestExtension } from "../_shared/tools/extensions.ts";
import { supabaseExtensionStore } from "../_shared/tools/supabase-store.ts";

const STATUS: Record<BookingError["code"], number> = {
  invalid: 400,
  not_found: 404,
  unavailable: 409,
  capacity: 422,
  unpriced: 422,
};

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { reservation_id?: string; new_check_out?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body.reservation_id || !/^[0-9a-f-]{36}$/i.test(body.reservation_id)) {
    return json({ error: "reservation_id is required" }, 400);
  }

  const db = adminClient();
  const { data: r } = await db
    .from("reservations")
    .select("id, tenant_id, room_id, status, end_at, people, member_id, access_token_hash")
    .eq("id", body.reservation_id)
    .maybeSingle();

  // Same answer whether the booking does not exist or is not the caller's.
  let owner = false;
  if (r && body.token && r.access_token_hash) {
    owner = (await sha256Hex(body.token)) === r.access_token_hash;
  } else if (r?.member_id) {
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (jwt && jwt.split(".").length === 3) {
      const { data } = await db.auth.getUser(jwt);
      if (data.user) {
        const { data: m } = await db
          .from("members")
          .select("id")
          .eq("id", r.member_id)
          .eq("user_id", data.user.id)
          .maybeSingle();
        owner = !!m;
      }
    }
  }
  if (!r || !owner) return json({ error: "Reserva no encontrada", code: "not_found" }, 404);

  try {
    const result = await requestExtension(supabaseExtensionStore(db), r, body);
    return json(result, 201);
  } catch (e) {
    if (e instanceof BookingError) return json({ error: e.message, code: e.code }, STATUS[e.code]);
    console.error(`stays-extend failed: ${(e as Error).message}`);
    return json({ error: "No se pudo solicitar la ampliación" }, 500);
  }
});
