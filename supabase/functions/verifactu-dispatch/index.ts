// POST /verifactu-dispatch  { tenant_id? }
//
// Sends the pending VERI*FACTU billing records to the AEAT and keeps its
// answers. Called every minute by the database (verifactu_tick, with its own
// key VERIFACTU_CRON_KEY; set up by scripts/verifactu-setup.mjs), with the
// service key (every hotel), or by staff from the panel ("Enviar ahora").
// The invoicing system identifies its producer with the secrets
// VERIFACTU_PRODUCER_NAME and VERIFACTU_PRODUCER_NIF (required outside the
// simulated environment).
import { adminClient, corsHeaders, json, verifiedUser } from "../_shared/http.ts";
import { dispatchTenant, type DispatchReport } from "../_shared/verifactu/dispatch.ts";
import { supabaseVerifactuStore } from "../_shared/verifactu/supabase-store.ts";
import { transportFor } from "../_shared/verifactu/transport.ts";

export const SIF_VERSION = "1.0.0";

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
  const cronKey = Deno.env.get("VERIFACTU_CRON_KEY");
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

  const producerName = Deno.env.get("VERIFACTU_PRODUCER_NAME");
  const producerNif = Deno.env.get("VERIFACTU_PRODUCER_NIF");
  const store = supabaseVerifactuStore(db);
  const results: Record<string, DispatchReport | { error: string }> = {};
  for (const tenant of await store.tenantsWithWork(tenantId)) {
    try {
      results[tenant] = await dispatchTenant(
        store,
        (env, cert) => {
          if (env !== "simulated" && (!producerName || !producerNif))
            throw new Error("Faltan los datos del fabricante del sistema de facturación");
          return transportFor(env, cert);
        },
        {
          producerName: producerName ?? "Melend/OS (demostración)",
          producerNif: producerNif ?? "B00000000",
          name: "Melend/OS",
          id: "MO",
          version: SIF_VERSION,
        },
        tenant,
      );
      const r = results[tenant] as DispatchReport;
      if (r.sent)
        await db.from("usage_events").insert({
          tenant_id: tenant,
          metric: "verifactu.record",
          quantity: r.sent,
          unit: "record",
          metadata: r,
        });
    } catch (e) {
      console.error("verifactu-dispatch", tenant, e);
      results[tenant] = { error: (e as Error).message };
    }
  }
  return json({ ok: true, results });
});
