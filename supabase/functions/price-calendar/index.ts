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
  const tenantId = id(body.tenant_id);

  const db = adminClient();
  // The hotel comes from what is being priced; only active hotels answer.
  // One query whatever the entry point (the hotel is embedded in the room or
  // the property), instead of two in a row.
  const ACTIVE = ["trial", "active"];
  type Owner = { tenant_id: string; tenants: { status: string } | null } | null;
  let tenant: { id: string } | null = null;
  if (roomId || propertyId) {
    const { data } = await db
      .from(roomId ? "rooms" : "properties")
      .select("tenant_id, tenants(status)")
      .eq("id", (roomId ?? propertyId)!)
      .maybeSingle();
    const owner = data as unknown as Owner;
    if (owner && ACTIVE.includes(owner.tenants?.status ?? "")) tenant = { id: owner.tenant_id };
  } else if (tenantId) {
    const { data } = await db
      .from("tenants")
      .select("id")
      .eq("id", tenantId)
      .in("status", ACTIVE)
      .maybeSingle();
    tenant = data;
  }
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
