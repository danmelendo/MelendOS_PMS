// POST /price-calendar
// { from, days, guests?, room_id? | property_id? | tenant_id? }
//
// Public fare calendar for the date pickers: per night, the average price of
// the free rooms (null when everything is taken). Priced on the server with
// the same engine as the bookings. No guest data leaves this function: only
// prices and counts of free rooms.
import { adminClient, corsHeaders, json } from "../_shared/http.ts";
import { CalendarError, priceCalendar } from "../_shared/tools/calendar.ts";
import { supabaseToolStore } from "../_shared/tools/supabase-store.ts";

const UUID = /^[0-9a-f-]{36}$/i;
const id = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const roomId = id(body.room_id);
  const propertyId = id(body.property_id);
  let tenantId = id(body.tenant_id);

  const db = adminClient();
  // The hotel comes from what is being priced; only active hotels answer.
  if (roomId) {
    const { data } = await db.from("rooms").select("tenant_id").eq("id", roomId).maybeSingle();
    tenantId = data?.tenant_id ?? null;
  } else if (propertyId) {
    const { data } = await db
      .from("properties")
      .select("tenant_id")
      .eq("id", propertyId)
      .maybeSingle();
    tenantId = data?.tenant_id ?? null;
  }
  const { data: tenant } = tenantId
    ? await db
        .from("tenants")
        .select("id")
        .eq("id", tenantId)
        .in("status", ["trial", "active"])
        .maybeSingle()
    : { data: null };
  if (!tenant) return json({ error: "Hotel no encontrado" }, 404);

  try {
    const calendar = await priceCalendar(supabaseToolStore(db), {
      tenantId: tenant.id,
      propertyId,
      roomId,
      from: String(body.from ?? ""),
      days: Number(body.days ?? 42),
      guests: Number(body.guests ?? 1),
    });
    return json(calendar);
  } catch (e) {
    if (e instanceof CalendarError) return json({ error: e.message }, 400);
    console.error(`price-calendar failed: ${(e as Error).message}`);
    return json({ error: "No se pudo calcular el calendario" }, 500);
  }
});
