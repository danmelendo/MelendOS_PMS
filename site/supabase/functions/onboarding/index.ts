// POST /onboarding   (sales project)
//
// From the database (Authorization: Bearer ONBOARDING_CRON_KEY):
//   { action: "dispatch" }  sends the queued forms: a new private link each
//                           (only its sha256 is kept), valid 30 days
// From the public page /alta/?t=<token> (the link is the only credential):
//   { action: "load", t }                          → client, answers, files, status
//   { action: "save", t, data }                    → keeps a draft
//   { action: "submit", t, data }                  → checks it is complete, sends
//                                                    it to sales (email)
//   { action: "upload", t, kind, name, size }      → signed upload URL (bucket
//                                                    "onboarding") + file row
//   { action: "delete_file", t, id }
//
// Answers are cleaned with the same rules as the page (_shared/onboarding.ts).
// Every failure with the link answers the same, without telling why. The
// customer can edit until sales marks the form completed.
// Secrets: ONBOARDING_CRON_KEY, RESEND_API_KEY, CUSTOMER_FROM_EMAIL (sender),
// LEADS_NOTIFY_EMAIL (sales: replies and the notice), SITE_URL.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  cleanOnboardingData,
  fileContentType,
  FILE_KINDS,
  MAX_FILE_BYTES,
  MAX_FILES,
  onboardingProblems,
  type FileKind,
} from "../_shared/onboarding.ts";
import { onboardingInviteEmail, onboardingSubmittedEmail } from "../_shared/onboarding-email.ts";

const LINK_DAYS = 30;
const MAX_DATA_BYTES = 64 * 1024;
const BAD_LINK =
  "Este enlace no es válido o ha caducado. Pídenos uno nuevo respondiendo a nuestro email.";

const ORIGINS = (Deno.env.get("SITE_ORIGIN") ?? "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

function corsFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": !ORIGINS.length
      ? "*"
      : ORIGINS.includes(origin)
        ? origin
        : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sendEmail(body: Record<string, unknown>): Promise<string | null> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return "RESEND_API_KEY no configurada";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.ok ? null : `Resend ${r.status}: ${(await r.text()).slice(0, 300)}`;
  } catch (e) {
    return (e as Error).message;
  }
}

const siteUrl = () => (Deno.env.get("SITE_URL") ?? "https://os.melendo.app").replace(/\/+$/, "");
const fromAddress = () =>
  Deno.env.get("CUSTOMER_FROM_EMAIL") ?? "Melend/OS <onboarding@resend.dev>";
const salesEmail = () => Deno.env.get("LEADS_NOTIFY_EMAIL") ?? null;

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { persistSession: false },
    },
  );

  try {
    // ── From the database: send what is queued ────────────────────────────
    if (body.action === "dispatch") {
      const cronKey = Deno.env.get("ONBOARDING_CRON_KEY");
      if (!cronKey || req.headers.get("authorization") !== `Bearer ${cronKey}`)
        return json({ error: "Unauthorized" }, 401);
      const { data: queued, error } = await db
        .from("client_onboarding")
        .select("id, email, send_attempts, clients(name, contact_name)")
        .eq("status", "queued")
        .lt("send_attempts", 5)
        .limit(20);
      if (error) throw error;
      let sent = 0;
      for (const row of queued ?? []) {
        const client = row.clients as unknown as {
          name: string;
          contact_name: string | null;
        } | null;
        const token = newToken();
        const expiresAt = new Date(Date.now() + LINK_DAYS * 86_400_000);
        const mail = onboardingInviteEmail({
          clientName: client?.name ?? "tu alojamiento",
          contactName: client?.contact_name ?? null,
          link: `${siteUrl()}/alta/?t=${token}`,
          expiresAt,
          assets: `${siteUrl()}/email`,
        });
        const failure = await sendEmail({
          from: fromAddress(),
          to: [row.email],
          reply_to: salesEmail() ?? undefined,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
        await db
          .from("client_onboarding")
          .update(
            failure
              ? { send_attempts: row.send_attempts + 1, last_error: failure }
              : {
                  status: "sent",
                  token_hash: await sha256(token),
                  expires_at: expiresAt.toISOString(),
                  sent_at: new Date().toISOString(),
                  send_attempts: row.send_attempts + 1,
                  last_error: null,
                },
          )
          .eq("id", row.id)
          .eq("status", "queued");
        if (!failure) sent++;
      }
      return json({ sent, queued: (queued ?? []).length });
    }

    // ── From the public page: the link is the credential ─────────────────
    const token = typeof body.t === "string" ? body.t.trim() : "";
    if (token.length < 20 || token.length > 100) return json({ error: BAD_LINK }, 404);
    const { data: form } = await db
      .from("client_onboarding")
      .select(
        "id, client_id, status, data, expires_at, opened_at, submitted_at, email, clients(name, plan, rooms)",
      )
      .eq("token_hash", await sha256(token))
      .maybeSingle();
    if (
      !form ||
      !["sent", "in_progress", "submitted"].includes(form.status) ||
      !form.expires_at ||
      new Date(form.expires_at) < new Date()
    )
      return json({ error: BAD_LINK }, 404);

    const files = async () => {
      const { data, error } = await db
        .from("client_onboarding_files")
        .select("id, kind, name, size, created_at")
        .eq("onboarding_id", form.id)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    };
    const client = form.clients as unknown as { name: string; plan: string; rooms: number } | null;

    if (body.action === "load") {
      if (!form.opened_at)
        await db
          .from("client_onboarding")
          .update({
            opened_at: new Date().toISOString(),
            status: form.status === "sent" ? "in_progress" : form.status,
          })
          .eq("id", form.id);
      return json({
        client: {
          name: client?.name ?? "",
          plan: client?.plan ?? null,
          rooms: client?.rooms ?? null,
        },
        status: form.status === "submitted" ? "submitted" : "open",
        submitted_at: form.submitted_at,
        expires_at: form.expires_at,
        data: form.data,
        files: await files(),
      });
    }

    if (body.action === "save" || body.action === "submit") {
      if (JSON.stringify(body.data ?? {}).length > MAX_DATA_BYTES)
        return json({ error: "Demasiado texto: acorta las notas." }, 400);
      const data = cleanOnboardingData(body.data);
      const update: Record<string, unknown> = { data };
      if (body.action === "submit") {
        const kinds = (await files()).map((f) => f.kind as FileKind);
        const problems = onboardingProblems(data, kinds);
        if (problems.length) return json({ error: "Falta información", problems }, 422);
        update.status = "submitted";
        update.submitted_at = new Date().toISOString();
      }
      const { error } = await db.from("client_onboarding").update(update).eq("id", form.id);
      if (error) throw error;
      if (body.action === "submit") {
        const to = salesEmail();
        if (to) {
          const mail = onboardingSubmittedEmail({
            clientName: client?.name ?? "Un cliente",
            email: form.email,
            files: (await files()).length,
            adminUrl: `${siteUrl()}/admin/#clientes`,
            assets: `${siteUrl()}/email`,
          });
          const failure = await sendEmail({
            from: fromAddress(),
            to: [to],
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
          });
          if (failure) console.error(`onboarding notice failed: ${failure}`);
        }
      }
      return json({ ok: true, status: body.action === "submit" ? "submitted" : "open" });
    }

    if (body.action === "upload") {
      const kind = String(body.kind ?? "") as FileKind;
      const name = String(body.name ?? "")
        .trim()
        .slice(0, 160);
      const size = Number(body.size);
      if (!FILE_KINDS.some((k) => k.kind === kind))
        return json({ error: "Tipo de archivo no válido" }, 400);
      const contentType = fileContentType(kind, name);
      if (!name || !contentType)
        return json({ error: "Ese formato de archivo no se admite aquí" }, 400);
      if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES)
        return json({ error: "El archivo pasa de 20 MB. Comprímelo o divídelo." }, 400);
      if ((await files()).length >= MAX_FILES)
        return json({ error: `Máximo ${MAX_FILES} archivos` }, 400);
      const safe = name
        .normalize("NFKD")
        .replace(/[^\w.-]+/g, "_")
        .slice(-100);
      const path = `${form.id}/${kind}/${crypto.randomUUID()}-${safe}`;
      const { data: signed, error } = await db.storage
        .from("onboarding")
        .createSignedUploadUrl(path);
      if (error) throw error;
      const { data: row, error: insertError } = await db
        .from("client_onboarding_files")
        .insert({ onboarding_id: form.id, kind, name, path, size, content_type: contentType })
        .select("id")
        .single();
      if (insertError) throw insertError;
      return json({ id: row.id, path, token: signed.token, content_type: contentType });
    }

    if (body.action === "delete_file") {
      const { data: file } = await db
        .from("client_onboarding_files")
        .select("id, path")
        .eq("id", String(body.id ?? ""))
        .eq("onboarding_id", form.id)
        .maybeSingle();
      if (!file) return json({ error: "Archivo no encontrado" }, 404);
      await db.storage.from("onboarding").remove([file.path]);
      await db.from("client_onboarding_files").delete().eq("id", file.id);
      return json({ ok: true });
    }

    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    console.error(`onboarding failed: ${(e as Error).message}`);
    return json({ error: "No se ha podido guardar. Inténtalo de nuevo en un momento." }, 500);
  }
});
