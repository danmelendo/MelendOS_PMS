// The email sent to sales for every new lead. Pure: builds subject, HTML and
// text from the stored lead; the leads function sends it (Resend).
import { DEMO_TIMEZONE } from "./slots.ts";

export interface LeadForEmail {
  id: string;
  kind: "demo" | "contact";
  slot_start: string | null;
  name: string;
  email: string;
  company: string;
  phone: string | null;
  hotels: number;
  rooms: number | null;
  plan: string | null;
  message: string | null;
  marketing_ok: boolean;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
  page: string | null;
}

const PLAN_NAMES: Record<string, string> = {
  hostal: "Hostal",
  starter: "Esencial",
  pro: "Profesional",
  group: "Grupo",
};

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** When the demo is, in Madrid time, or that the lead wants to be called. */
export function leadWhen(slot: string | null) {
  if (!slot) return "Sin cita: quiere que le contactemos";
  return new Date(slot).toLocaleString("es-ES", {
    timeZone: DEMO_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function leadEmail(lead: LeadForEmail, adminUrl?: string) {
  const when = leadWhen(lead.slot_start);
  const subject =
    lead.kind === "demo"
      ? `Nueva demo: ${lead.company} · ${when}`
      : `Nuevo contacto: ${lead.company}`;
  const origin =
    [lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(" / ") ||
    lead.referrer ||
    "Directo";
  const rows: [string, string][] = [
    ["Cuándo", when],
    ["Nombre", lead.name],
    ["Email", lead.email],
    ["Teléfono", lead.phone ?? "—"],
    ["Hotel o grupo", lead.company],
    ["Hoteles", String(lead.hotels)],
    ["Habitaciones", lead.rooms ? String(lead.rooms) : "—"],
    ["Plan", lead.plan ? (PLAN_NAMES[lead.plan] ?? lead.plan) : "Aún no lo sabe"],
    ["Qué quiere ver", lead.message ?? "—"],
    ["Novedades", lead.marketing_ok ? "Acepta recibirlas" : "No"],
    ["Origen", origin],
    ["Página", lead.page ?? "—"],
  ];
  const link = adminUrl ? `${adminUrl.replace(/\/+$/, "")}/admin/?lead=${lead.id}` : null;
  const html = `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;color:#1d2a44;margin:0;padding:24px;background:#f4f6f9">
<div style="max-width:560px;margin:auto;background:#fff;border:1px solid #dfe4ec;border-radius:10px;overflow:hidden">
<div style="background:#1b2440;color:#fff;padding:16px 20px;font-size:16px;font-weight:600">${esc(subject)}</div>
<table style="width:100%;border-collapse:collapse;font-size:14px">
${rows
  .map(
    ([k, v]) =>
      `<tr><td style="padding:8px 20px;color:#5d6b82;width:130px;vertical-align:top;border-bottom:1px solid #eef1f5">${esc(k)}</td><td style="padding:8px 20px;border-bottom:1px solid #eef1f5">${esc(v).replace(/\n/g, "<br>")}</td></tr>`,
  )
  .join("\n")}
</table>
${link ? `<div style="padding:16px 20px"><a href="${esc(link)}" style="background:#1b2440;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;font-size:14px">Abrir en el panel</a></div>` : ""}
</div></body></html>`;
  const text = [
    subject,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(link ? ["", link] : []),
  ].join("\n");
  return { subject, html, text };
}
