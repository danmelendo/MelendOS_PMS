// POST /guest-emails-dispatch
//
// Sends the queued emails to guests (booking confirmed or cancelled). Called
// every minute by the database while something is pending (guest_emails_tick,
// with its own key GUEST_EMAILS_CRON_KEY; set up by scripts/emails-setup.mjs)
// or with the service key. Sends with Resend when the project has
// RESEND_API_KEY and EMAIL_FROM; otherwise the emails are only logged
// ("simulated"). Links go to the hotel's domain, or PUBLIC_WEB_URL.
import { adminClient, corsHeaders, json } from "../_shared/http.ts";
import { dispatchEmails } from "../_shared/email/dispatch.ts";
import { supabaseEmailStore } from "../_shared/email/supabase-store.ts";
import { emailTransport } from "../_shared/email/transport.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const cronKey = Deno.env.get("GUEST_EMAILS_CRON_KEY");
  const allowed =
    !!bearer &&
    (bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || (!!cronKey && bearer === cronKey));
  if (!allowed) return json({ error: "No autorizado" }, 403);

  const { transport, fromAddress } = emailTransport(Deno.env);
  try {
    const report = await dispatchEmails(
      supabaseEmailStore(adminClient(), Deno.env.get("PUBLIC_WEB_URL") ?? null),
      transport,
      { fromAddress },
    );
    return json({ mode: transport.mode, ...report });
  } catch (e) {
    console.error(`guest-emails-dispatch failed: ${(e as Error).message}`);
    return json({ error: "No se pudieron enviar los emails" }, 500);
  }
});
