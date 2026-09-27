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

// ── Confirmation to the person who asked for the demo ────────────────────────

const BRAND = "Melend/OS";
/** Where leads unsubscribe or exercise their data rights (same as the web's privacy page). */
export const PRIVACY_EMAIL = "privacidad@melendo.app";

/** Calendar file (iCalendar) of a demo call; `uid` keeps it stable per lead. */
export function demoIcs(slot: string, uid: string, minutes = 30) {
  const stamp = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const start = new Date(slot);
  const end = new Date(start.getTime() + minutes * 60_000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${BRAND}//Demo//ES`,
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@melendo.app`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:Demo de ${BRAND}`,
    "DESCRIPTION:Videollamada de 30 minutos. Te enviaremos el enlace por email antes de la cita.",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Email to the lead: the booked demo, or that we got the request. */
export function customerEmail(lead: LeadForEmail, siteUrl?: string) {
  const first = lead.name.trim().split(/\s+/)[0];
  const demo = lead.kind === "demo" && lead.slot_start;
  const when = demo ? leadWhen(lead.slot_start) : null;
  const subject = demo ? `Tu demo de ${BRAND}: ${when}` : `Hemos recibido tu solicitud · ${BRAND}`;
  const paragraphs = demo
    ? [
        `Hola, ${first}:`,
        `Gracias por tu interés en ${BRAND}. Tu demo de 30 minutos por videollamada queda reservada para el <b>${esc(when!)}</b> (hora de Madrid).`,
        "Antes de la cita te enviaremos el enlace de la videollamada. Te enseñaremos cómo funcionan las reservas, la web sin comisiones, el registro de viajeros y lo que más te interese de tu hotel.",
        "Te adjuntamos la cita para que la añadas a tu calendario. Si necesitas cambiar la hora, responde a este email.",
      ]
    : [
        `Hola, ${first}:`,
        `Gracias por tu interés en ${BRAND}. Hemos recibido tu solicitud y te escribiremos en un día laborable para buscar juntos el mejor momento para enseñarte el programa.`,
        "Si quieres adelantarnos algo sobre tu hotel, responde a este email.",
      ];
  const pricing = siteUrl ? `${siteUrl.replace(/\/+$/, "")}/precios/` : null;
  const html = `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;color:#1d2a44;margin:0;padding:24px;background:#f4f6f9">
<div style="max-width:560px;margin:auto;background:#fff;border:1px solid #dfe4ec;border-radius:10px;overflow:hidden">
<div style="background:#1b2440;color:#fff;padding:18px 24px;font-size:18px;font-weight:700">${BRAND}</div>
<div style="padding:8px 24px 20px;font-size:15px;line-height:1.55">
${paragraphs.map((p, i) => `<p style="margin:14px 0">${i === 0 ? esc(p) : p}</p>`).join("\n")}
${pricing ? `<p style="margin:18px 0 6px"><a href="${esc(pricing)}" style="color:#2d63b8">Consulta los precios</a></p>` : ""}
<p style="margin:18px 0 0">Un saludo,<br>El equipo de ${BRAND}</p>
</div>
<div style="padding:12px 24px;border-top:1px solid #eef1f5;font-size:12px;color:#8a96aa">Recibes este email porque lo solicitaste en la web de ${BRAND}. Si no has sido tú, ignóralo. Para darte de baja o ejercer tus derechos sobre tus datos, escribe a <a href="mailto:${PRIVACY_EMAIL}" style="color:#8a96aa">${PRIVACY_EMAIL}</a>.</div>
</div></body></html>`;
  const text = [
    ...paragraphs.map((p) => p.replace(/<[^>]+>/g, "")),
    ...(pricing ? ["", `Precios: ${pricing}`] : []),
    "",
    `Un saludo,\nEl equipo de ${BRAND}`,
    `Para darte de baja o ejercer tus derechos sobre tus datos: ${PRIVACY_EMAIL}`,
  ].join("\n\n");
  return { subject, html, text, ics: demo ? demoIcs(lead.slot_start!, lead.id) : null };
}
