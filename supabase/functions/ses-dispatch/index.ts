// POST /ses-dispatch  { tenant_id? }
//
// Sends the pending SES.HOSPEDAJES communications (traveller register of the
// Ministry of the Interior) and collects the answers of those already sent.
// Called every 10 minutes by the database (ses_dispatch_tick, with its own key
// SES_CRON_KEY; set up by scripts/ses-setup.mjs), with the service key (every
// hotel), or by staff from the panel ("Enviar ahora", their hotel only).
import { adminClient, corsHeaders, json, verifiedUser } from "../_shared/http.ts";
import { dispatchTenant, type DispatchReport } from "../_shared/ses/dispatch.ts";
import { supabaseSesStore } from "../_shared/ses/supabase-store.ts";
import { transportFor } from "../_shared/ses/transport.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body: { tenant_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* no body: every hotel (service key only) */
  }

  const db = adminClient();
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const cronKey = Deno.env.get("SES_CRON_KEY");
  const service =
    !!bearer &&
    (bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || (!!cronKey && bearer === cronKey));
  const tenantId = body.tenant_id ?? null;
  if (!service) {
    const { data: auth } =
      bearer.split(".").length === 3 ? await verifiedUser(db, bearer) : { data: null };
    const { data: member } =
      auth?.user && tenantId
        ? await db
            .from("tenant_members")
            .select("role")
            .eq("tenant_id", tenantId)
            .eq("user_id", auth.user.id)
            .maybeSingle()
        : { data: null };
    if (!member) return json({ error: "No autorizado" }, 403);
  }

  const store = supabaseSesStore(db);
  const results: Record<string, DispatchReport | { error: string }> = {};
  for (const tenant of await store.enabledTenants(tenantId)) {
    try {
      const config = await store.config(tenant);
      if (!config) continue;
      if (config.environment !== "simulated" && !config.landlordCode) {
        results[tenant] = { error: "Falta el código de arrendador" };
        continue;
      }
      results[tenant] = await dispatchTenant(store, transportFor(config), tenant);
      const report = results[tenant] as DispatchReport;
      if (report.sent)
        await db.from("usage_events").insert({
          tenant_id: tenant,
          metric: "ses.communication",
          quantity: report.sent,
          unit: "communication",
          metadata: { environment: config.environment, ...report },
        });
    } catch (e) {
      console.error("ses-dispatch", tenant, e);
      results[tenant] = { error: (e as Error).message };
    }
  }
  if (tenantId && !(tenantId in results))
    return json({ error: "El registro de viajeros no está activado en este hotel" }, 409);
  return json({ ok: true, results });
});
