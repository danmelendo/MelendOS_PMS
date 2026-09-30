// POST /tenant-modules  { tenant_id, packages: ["stay", "ai", …] }
//
// Changes the packages a hotel has, so visitors of the demo can try the
// product with and without each package. Only in the demo: it answers 403
// unless the project has the DEMO_ACCESS=true secret (in production packages
// are contracted with sales and set by the platform, never by the hotel).
// Caller: Melend/OS support on that hotel (Authorization: Bearer <user JWT>).
import { adminClient, corsHeaders, json, verifiedUser } from "../_shared/http.ts";
import { PACKAGE_IDS } from "../_shared/domain/features.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (Deno.env.get("DEMO_ACCESS") !== "true") {
    return json({ error: "Para cambiar de plan, contacta con ventas." }, 403);
  }

  let body: { tenant_id?: string; packages?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const packages = Array.isArray(body.packages)
    ? PACKAGE_IDS.filter((p) => (body.packages as unknown[]).includes(p))
    : null;
  if (!body.tenant_id || !packages) return json({ error: "tenant_id y packages" }, 400);

  const db = adminClient();
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: auth } = jwt.split(".").length === 3 ? await verifiedUser(db, jwt) : { data: null };
  const userId = auth?.user?.id;
  const { data: member } = userId
    ? await db
        .from("tenant_members")
        .select("role")
        .eq("tenant_id", body.tenant_id)
        .eq("user_id", userId)
        .maybeSingle()
    : { data: null };
  // Plan and modules are set by Melend/OS (support role), never by the hotel.
  if (member?.role !== "platform") {
    return json({ error: "El plan lo gestiona Melend/OS: contacta con ventas" }, 403);
  }

  const { data: tenant } = await db
    .from("tenants")
    .select("settings")
    .eq("id", body.tenant_id)
    .single();
  const settings = { ...((tenant?.settings as Record<string, unknown>) ?? {}), packages };
  const { error } = await db.from("tenants").update({ settings }).eq("id", body.tenant_id);
  if (error) return json({ error: "No se pudo guardar" }, 500);
  await db.from("domain_events").insert({
    tenant_id: body.tenant_id,
    event_type: "tenant.packages_changed",
    entity: "tenant",
    entity_id: body.tenant_id,
    actor_id: userId,
    payload: { packages },
  });
  return json({ packages });
});
