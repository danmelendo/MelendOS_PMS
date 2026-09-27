// POST /leads   (sales project, called by the website with the publishable key)
// { action: "slots" }  → { slots: string[] }  free demo call times (UTC ISO)
// { action: "submit", kind: "demo" | "contact", slot?, name, email, company,
//   phone?, hotels?, rooms?, plan?, message?, privacy_ok, marketing_ok?,
//   utm_source?, utm_medium?, utm_campaign?, referrer?, page?, website? }
//                      → { id, slot, confirmation }
//
// Only free times leave this function, never who booked the others. Abuse
// limits: a honeypot field (`website`), 3 leads per email and 5 per IP a day,
// one live call per slot (unique index). Emails through Resend (RESEND_API_KEY):
// each new lead to LEADS_NOTIFY_EMAIL from LEADS_FROM_EMAIL (panel link from
// SITE_URL), and a confirmation to the lead from CUSTOMER_FROM_EMAIL (the demo
// with a calendar file, or that we got the request; replies go to sales). If
// SALES_WEBHOOK_URL is set, the lead is also posted there. A failed
// notification never fails the lead.
import { createClient } from "npm:@supabase/supabase-js@2";
import { demoSlots, DEMO_TIMEZONE } from "../_shared/slots.ts";
import { customerEmail, leadEmail } from "../_shared/lead-email.ts";

const FALLBACK_FROM = "Melend/OS <onboarding@resend.dev>";

const base64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

/** Sends one email through Resend; returns the HTTP status (0 on network error). */
async function sendEmail(key: string, body: Record<string, unknown>) {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) console.error(`email to ${body.to} failed: ${r.status} ${await r.text()}`);
    return r.status;
  } catch (e) {
    console.error(`email to ${body.to} failed: ${(e as Error).message}`);
    return 0;
  }
}

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PLANS = ["hostal", "starter", "pro", "group"];
const DAY_MS = 86_400_000;
const TAKEN_MSG = "Esa hora ya no está libre. Elige otra, por favor.";

const text = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const int = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
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
    { auth: { persistSession: false } },
  );
  const now = new Date();
  const takenSlots = async () => {
    const { data, error } = await db
      .from("leads")
      .select("slot_start")
      .not("slot_start", "is", null)
      .in("status", ["new", "confirmed"])
      .gte("slot_start", now.toISOString());
    if (error) throw error;
    return (data ?? []).map((r) => r.slot_start as string);
  };

  try {
    if (body.action === "slots") return json({ slots: demoSlots(now, await takenSlots()) });
    if (body.action !== "submit") return json({ error: "Acción desconocida" }, 400);

    // Bots fill every field; people never see this one.
    if (text(body.website, 200)) return json({ error: "Solicitud no válida" }, 400);

    const kind = body.kind === "demo" ? "demo" : "contact";
    const name = text(body.name, 120);
    const email = text(body.email, 200)?.toLowerCase() ?? null;
    const company = text(body.company, 160);
    if (!name || name.length < 2) return json({ error: "Indica tu nombre" }, 400);
    if (!email || !EMAIL.test(email)) return json({ error: "Indica un email válido" }, 400);
    if (!company || company.length < 2)
      return json({ error: "Indica el nombre del hotel o grupo" }, 400);
    if (body.privacy_ok !== true)
      return json({ error: "Necesitamos que aceptes la política de privacidad" }, 400);

    let slotIso: string | null = null;
    if (kind === "demo") {
      const slot = typeof body.slot === "string" ? new Date(body.slot) : null;
      slotIso = slot && !Number.isNaN(slot.getTime()) ? slot.toISOString() : null;
      if (!slotIso || !demoSlots(now, await takenSlots()).includes(slotIso))
        return json({ error: TAKEN_MSG }, 409);
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";
    const ipHash = ip ? await sha256(ip) : null;
    const since = new Date(now.getTime() - DAY_MS).toISOString();
    const { count: byEmail } = await db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", since);
    const { count: byIp } = ipHash
      ? await db
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("ip_hash", ipHash)
          .gte("created_at", since)
      : { count: 0 };
    if ((byEmail ?? 0) >= 3 || (byIp ?? 0) >= 5)
      return json({ error: "Ya tenemos tus datos de hoy. Te escribiremos enseguida." }, 429);

    const lead = {
      kind,
      slot_start: slotIso,
      name,
      email,
      company,
      phone: text(body.phone, 40),
      hotels: int(body.hotels, 1, 500) ?? 1,
      rooms: int(body.rooms, 1, 20000),
      plan: typeof body.plan === "string" && PLANS.includes(body.plan) ? body.plan : null,
      message: text(body.message, 2000),
      privacy_ok: true,
      marketing_ok: body.marketing_ok === true,
      utm_source: text(body.utm_source, 100),
      utm_medium: text(body.utm_medium, 100),
      utm_campaign: text(body.utm_campaign, 100),
      referrer: text(body.referrer, 500),
      page: text(body.page, 200),
      ip_hash: ipHash,
    };
    const { data, error } = await db.from("leads").insert(lead).select("id, slot_start").single();
    if (error) {
      // Unique slot index: someone booked the same time a moment ago.
      if (error.code === "23505") return json({ error: TAKEN_MSG }, 409);
      throw error;
    }

    // Whether the lead got its confirmation email (the page says so only then).
    let confirmation = false;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const stored = { id: data.id, ...lead };
      const siteUrl = Deno.env.get("SITE_URL");
      const notifyTo = Deno.env
        .get("LEADS_NOTIFY_EMAIL")
        ?.split(",")
        .map((e) => e.trim());
      const customerFrom = Deno.env.get("CUSTOMER_FROM_EMAIL");
      const jobs: Promise<unknown>[] = [];
      if (notifyTo?.length) {
        const mail = leadEmail(stored, siteUrl);
        const payload = {
          to: notifyTo,
          reply_to: email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        };
        const from = Deno.env.get("LEADS_FROM_EMAIL") ?? FALLBACK_FROM;
        // If the own domain is not verified (yet), Resend refuses it: sales
        // still gets the lead from Resend's test sender.
        jobs.push(
          sendEmail(resendKey, { from, ...payload }).then((status) =>
            status === 403 && from !== FALLBACK_FROM
              ? sendEmail(resendKey, { from: FALLBACK_FROM, ...payload })
              : status,
          ),
        );
      }
      if (customerFrom) {
        const mail = customerEmail(stored, siteUrl);
        jobs.push(
          sendEmail(resendKey, {
            from: customerFrom,
            to: [email],
            reply_to: notifyTo?.[0],
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            attachments: mail.ics
              ? [{ filename: "demo-melendos.ics", content: base64(mail.ics) }]
              : undefined,
          }).then((status) => (confirmation = status === 200)),
        );
      }
      await Promise.allSettled(jobs);
    }

    const hook = Deno.env.get("SALES_WEBHOOK_URL");
    if (hook) {
      const when = slotIso
        ? new Date(slotIso).toLocaleString("es-ES", {
            timeZone: DEMO_TIMEZONE,
            dateStyle: "full",
            timeStyle: "short",
          })
        : "sin cita (quiere que le contactemos)";
      await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Nuevo lead: ${company} · ${name} <${email}> · ${when}`,
          lead: { id: data.id, ...lead, ip_hash: undefined },
        }),
      }).catch((e) => console.error(`sales webhook failed: ${(e as Error).message}`));
    }

    return json({ id: data.id, slot: data.slot_start, confirmation });
  } catch (e) {
    console.error(`leads failed: ${(e as Error).message}`);
    return json({ error: "No se pudo enviar. Inténtalo de nuevo en un momento." }, 500);
  }
});
