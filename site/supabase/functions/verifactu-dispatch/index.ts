// POST /verifactu-dispatch  (sales project)
//
// Sends Melend/OS's pending VERI*FACTU billing records to the AEAT and keeps
// its answers, with the product's engine (_shared/verifactu, copied). Called
// every minute by the database while something is pending
// (sales_verifactu_tick, key VERIFACTU_CRON_KEY; site/scripts/verifactu-setup.mjs)
// or with the service key. The system's producer goes in the secrets
// VERIFACTU_PRODUCER_NAME and VERIFACTU_PRODUCER_NIF (required outside the
// simulated environment); the client certificate, in Vault.
import { createClient } from "npm:@supabase/supabase-js@2";
import { dispatchTenant } from "../_shared/verifactu/dispatch.ts";
import { SALES_ISSUER, salesVerifactuStore } from "../_shared/verifactu/sales-store.ts";
import { transportFor } from "../_shared/verifactu/transport.ts";

export const SIF_VERSION = "1.0.0";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const cronKey = Deno.env.get("VERIFACTU_CRON_KEY");
  const allowed =
    !!bearer &&
    (bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || (!!cronKey && bearer === cronKey));
  if (!allowed) return json({ error: "No autorizado" }, 403);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { persistSession: false },
    },
  );
  const producerName = Deno.env.get("VERIFACTU_PRODUCER_NAME");
  const producerNif = Deno.env.get("VERIFACTU_PRODUCER_NIF");
  try {
    const report = await dispatchTenant(
      salesVerifactuStore(db),
      (env, cert) => {
        if (env !== "simulated" && (!producerName || !producerNif))
          throw new Error("Faltan los datos del fabricante del sistema de facturación");
        return transportFor(env, cert);
      },
      {
        producerName: producerName ?? "Melend/OS (pruebas)",
        producerNif: producerNif ?? "B00000000",
        name: "Melend/OS",
        id: "MO",
        version: SIF_VERSION,
      },
      SALES_ISSUER,
    );
    return json({ ok: true, report });
  } catch (e) {
    console.error("verifactu-dispatch", e);
    return json({ error: (e as Error).message }, 500);
  }
});
