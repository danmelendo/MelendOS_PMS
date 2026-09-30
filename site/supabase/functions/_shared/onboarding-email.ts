// Emails of the onboarding form: the invitation to the customer (their private
// link) and the notice to sales when they submit it. Same look as the
// product's Melend/OS emails (supabase/functions/_shared/email/layout.ts in the
// product: logo on white, gold line, brand picture closing the card, its own
// dark version and phone layout). Pure: the onboarding function sends them.

const NAVY = "#16233f";
const GOLD = "#c9a45c";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

export const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const CSS = `:root{color-scheme:light only;supported-color-schemes:light only}
body{margin:0;padding:0;-webkit-text-size-adjust:100%}
@media (max-width:540px){.outer{padding:0!important}.card{border-radius:0!important;border-left:0!important;border-right:0!important}.px{padding-left:20px!important;padding-right:20px!important}}
@media (prefers-color-scheme:dark){.bg{background:#0b1220!important}.card{background:#111827!important;border-color:#1f2937!important}.t1{color:#f8fafc!important}.t2{color:#cbd5e1!important}.t3{color:#94a3b8!important}.box{background:#172033!important;border-color:#263248!important}}
[data-ogsb] .bg{background:#0b1220!important}[data-ogsb] .card{background:#111827!important}[data-ogsc] .t1{color:#f8fafc!important}[data-ogsc] .t2{color:#cbd5e1!important}[data-ogsc] .t3{color:#94a3b8!important}[data-ogsb] .box{background:#172033!important}`;

function shell(title: string, preheader: string, assets: string, body: string) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(title)}</title><style>${CSS}</style></head>
<body class="bg" style="margin:0;padding:0;background:#eef1f5;font-family:${FONT};color:#1f2937">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5"><tr><td class="outer" align="center" style="padding:32px 12px">
<table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td align="center" class="px" style="padding:30px 32px 24px;background:#ffffff;border-bottom:3px solid ${GOLD}"><img src="${assets}/melendos-logo.png" width="260" alt="Melend/OS" style="display:block;width:260px;max-width:100%;height:auto;border:0;font-family:${SERIF};font-size:24px;color:${NAVY}"></td></tr>
${body}
<tr><td style="font-size:0;line-height:0;background:${NAVY}"><img src="${assets}/melendos-footer.jpg" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>
</table>
<p class="t3" style="margin:16px 12px 0;font-size:11px;color:#94a3b8">Melend/OS &middot; Gestión hotelera</p>
</td></tr></table>
</body></html>`;
}

function button(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${NAVY}"><a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background:${NAVY}">${esc(label)}</a></td></tr></table>`;
}

export interface InviteData {
  clientName: string;
  contactName: string | null;
  link: string;
  expiresAt: Date;
  /** Where the site serves the email images (…/email). */
  assets: string;
}

export function onboardingInviteEmail(d: InviteData) {
  const subject = `Da de alta ${d.clientName} en Melend/OS`;
  const hello = d.contactName ? `Hola, ${d.contactName.split(/\s+/)[0]}:` : "Hola:";
  const until = d.expiresAt.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Madrid",
  });
  const steps = [
    "Datos de tu alojamiento, fiscales e imagen",
    "Formas de pago, cancelación y tu equipo",
    "Tu Excel de habitaciones y tarifas, el logotipo y las fotos",
  ];
  const text = [
    hello,
    "",
    `Gracias por confiar en Melend/OS. Para preparar ${d.clientName} necesitamos unos datos: se rellenan en unos 15 minutos y puedes dejarlo a medias y volver con el mismo enlace.`,
    "",
    ...steps.map((s) => `- ${s}`),
    "",
    `Rellenar el formulario: ${d.link}`,
    `El enlace es personal y vale hasta el ${until}.`,
    "",
    "Si tienes cualquier duda, responde a este email.",
    "",
    "Melend/OS",
  ].join("\n");
  const body = `<tr><td class="px" style="padding:32px 32px 8px">
<p class="t1" style="margin:0 0 12px;font-family:${SERIF};font-size:22px;color:#0f172a">Empezamos con ${esc(d.clientName)}</p>
<p class="t2" style="margin:0 0 10px;font-size:16px;line-height:1.55;color:#334155">${esc(hello)}</p>
<p class="t2" style="margin:0;font-size:16px;line-height:1.55;color:#334155">Gracias por confiar en Melend/OS. Para preparar tu alojamiento necesitamos unos datos: se rellenan en unos 15 minutos y puedes dejarlo a medias y volver con el mismo enlace.</p>
</td></tr>
<tr><td class="px" style="padding:20px 32px 0"><div class="box" style="padding:16px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">
${steps.map((s, i) => `<div class="t2" style="padding:5px 0;font-size:14px;color:#334155"><span style="display:inline-block;width:22px;height:22px;line-height:22px;margin-right:10px;border-radius:999px;background:${GOLD};color:#ffffff;font-size:12px;font-weight:700;text-align:center">${i + 1}</span>${esc(s)}</div>`).join("\n")}
</div></td></tr>
<tr><td align="center" class="px" style="padding:28px 32px 8px">${button(d.link, "Rellenar el formulario de alta")}</td></tr>
<tr><td align="center" class="px t3" style="padding:4px 32px 0;font-size:13px;line-height:1.5;color:#64748b">El enlace es personal y vale hasta el ${esc(until)}. Si tienes cualquier duda, responde a este email.</td></tr>
<tr><td style="padding:0 0 28px"></td></tr>`;
  return {
    subject,
    text,
    html: shell(subject, `Datos para dar de alta ${d.clientName}`, d.assets, body),
  };
}

export interface SubmittedData {
  clientName: string;
  email: string;
  files: number;
  adminUrl: string;
  assets: string;
}

export function onboardingSubmittedEmail(d: SubmittedData) {
  const subject = `Formulario de alta recibido: ${d.clientName}`;
  const text = [
    `${d.clientName} ha enviado su formulario de alta (${d.email}, ${d.files} archivo(s)).`,
    "",
    `Revisarlo: ${d.adminUrl}`,
  ].join("\n");
  const body = `<tr><td class="px" style="padding:32px 32px 8px">
<p class="t1" style="margin:0 0 12px;font-family:${SERIF};font-size:22px;color:#0f172a">${esc(d.clientName)} ha enviado su formulario</p>
<p class="t2" style="margin:0;font-size:16px;line-height:1.55;color:#334155">Lo ha rellenado ${esc(d.email)} y ha subido ${d.files} archivo(s). Revisa los datos y pásame los Excel para adaptarlos al alta.</p>
</td></tr>
<tr><td align="center" class="px" style="padding:28px 32px 36px">${button(d.adminUrl, "Ver en el panel de gestión")}</td></tr>`;
  return { subject, text, html: shell(subject, subject, d.assets, body) };
}
