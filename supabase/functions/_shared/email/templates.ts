// Emails to the guest about their booking (confirmation, cancellation), in the
// guest's language (Spanish or English, chosen on the booking web), plain HTML
// with inline styles so every mail client shows them the same. Pure: the
// dispatcher loads the data and sends what this returns.

export type BookingEmailKind = "booking_confirmed" | "booking_cancelled" | "checkin_invite";
export type EmailLang = "es" | "en";

export interface BookingEmailData {
  kind: BookingEmailKind;
  /** The guest's language; Spanish when unknown. */
  lang?: EmailLang | null;
  hotelName: string;
  /** Brand colour (#rrggbb); falls back to a neutral navy. */
  accent: string | null;
  /**
   * Email header, chosen when the hotel is set up (tenants.brand.email_header):
   * "logo" (its logo on white), "image" (a photo across the top) or "color"
   * (a band in its colour). Falls back to what the hotel has: logo, else colour.
   */
  header?: EmailHeader | null;
  hotelEmail: string | null;
  hotelPhone: string | null;
  hotelAddress: string | null;
  guestName: string | null;
  reference: string;
  roomName: string;
  /** yyyy-MM-dd in hotel time. */
  checkIn: string;
  checkOut: string;
  checkInHour: number;
  checkOutHour: number;
  guests: number;
  total: number;
  paymentMode: "prepay" | "at_hotel";
  /** Amount already paid online. */
  paid: number;
  /** ISO instant until which cancelling is free (null: no free cancellation). */
  freeCancellationUntil: string | null;
  timezone: string;
  /** Link to manage the booking (with its access token). */
  manageUrl: string;
}

export interface EmailHeader {
  style: "logo" | "image" | "color" | null;
  logoUrl: string | null;
  imageUrl: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface Copy {
  locale: string;
  hello: (name: string | null) => string;
  subject: (confirmed: boolean, hotel: string, ref: string) => string;
  intro: (confirmed: boolean, hotel: string) => string;
  refunded: (amount: string) => string;
  nothingCharged: string;
  atHotel: (total: string) => string;
  paidAll: (total: string) => string;
  paidPart: (total: string, paid: string) => string;
  freeUntil: (when: string) => string;
  noFree: string;
  rows: {
    reference: string;
    room: string;
    checkIn: string;
    checkOut: string;
    nights: string;
    guests: string;
  };
  from: (date: string, hour: string) => string;
  until: (date: string, hour: string) => string;
  cta: (confirmed: boolean) => string;
  whatNext: string;
  checkinSubject: (hotel: string) => string;
  checkinIntro: (hotel: string) => string;
  checkinCta: string;
  checkinNote: string;
  status: { confirmed: string; cancelled: string; checkin: string };
  fromHour: (hour: string) => string;
  untilHour: (hour: string) => string;
  stay: string;
  footer: (hotel: string) => string;
}

const COPY: Record<EmailLang, Copy> = {
  es: {
    locale: "es-ES",
    hello: (n) => (n ? `Hola, ${n}:` : "Hola:"),
    subject: (c, h, r) => `Reserva ${c ? "confirmada" : "cancelada"} en ${h} · ${r}`,
    intro: (c, h) => `Tu reserva en ${h} está ${c ? "confirmada" : "cancelada"}.`,
    refunded: (a) =>
      `Pagaste ${a} online: el hotel tramita la devolución que corresponda según las condiciones que aceptaste.`,
    nothingCharged: "No se ha cobrado nada.",
    atHotel: (t) => `Total ${t}, que pagas en el hotel.`,
    paidAll: (t) => `Total ${t}, pagado.`,
    paidPart: (t, p) => `Total ${t}; pagado ${p}.`,
    freeUntil: (w) => `Cancelación gratuita hasta el ${w}.`,
    noFree: "Esta reserva no tiene cancelación gratuita.",
    rows: {
      reference: "Referencia",
      room: "Habitación",
      checkIn: "Entrada",
      checkOut: "Salida",
      nights: "Noches",
      guests: "Huéspedes",
    },
    from: (d, h) => `${d}, desde las ${h}`,
    until: (d, h) => `${d}, hasta las ${h}`,
    cta: (c) => (c ? "Ver o gestionar mi reserva" : "Ver mi reserva"),
    whatNext: "Desde ahí puedes hacer el check-in online, escribir a recepción o cancelar.",
    checkinSubject: (h) => `Completa tu check-in online · ${h}`,
    checkinIntro: (h) =>
      `Adelanta tu llegada a ${h}: registra a los viajeros y firma desde el móvil, en un minuto.`,
    checkinCta: "Hacer el check-in online",
    checkinNote: "El enlace es de un solo uso y caduca en cuanto firmas.",
    status: {
      confirmed: "Reserva confirmada",
      cancelled: "Reserva cancelada",
      checkin: "Check-in online",
    },
    fromHour: (h) => `desde las ${h}`,
    untilHour: (h) => `hasta las ${h}`,
    stay: "Tu estancia",
    footer: (h) => `Recibes este email por tu reserva en ${h}.`,
  },
  en: {
    locale: "en-GB",
    hello: (n) => (n ? `Hello ${n},` : "Hello,"),
    subject: (c, h, r) => `Booking ${c ? "confirmed" : "cancelled"} at ${h} · ${r}`,
    intro: (c, h) => `Your booking at ${h} is ${c ? "confirmed" : "cancelled"}.`,
    refunded: (a) =>
      `You paid ${a} online: the hotel will process any refund due under the terms you accepted.`,
    nothingCharged: "Nothing has been charged.",
    atHotel: (t) => `Total ${t}, to pay at the hotel.`,
    paidAll: (t) => `Total ${t}, paid.`,
    paidPart: (t, p) => `Total ${t}; paid ${p}.`,
    freeUntil: (w) => `Free cancellation until ${w}.`,
    noFree: "This booking has no free cancellation.",
    rows: {
      reference: "Reference",
      room: "Room",
      checkIn: "Check-in",
      checkOut: "Check-out",
      nights: "Nights",
      guests: "Guests",
    },
    from: (d, h) => `${d}, from ${h}`,
    until: (d, h) => `${d}, until ${h}`,
    cta: (c) => (c ? "View or manage my booking" : "View my booking"),
    whatNext: "From there you can check in online, message reception or cancel.",
    checkinSubject: (h) => `Complete your online check-in · ${h}`,
    checkinIntro: (h) =>
      `Get ahead of your arrival at ${h}: register the travellers and sign from your phone, in a minute.`,
    checkinCta: "Complete online check-in",
    checkinNote: "This is a single-use link and expires as soon as you sign.",
    status: {
      confirmed: "Booking confirmed",
      cancelled: "Booking cancelled",
      checkin: "Online check-in",
    },
    fromHour: (h) => `from ${h}`,
    untilHour: (h) => `until ${h}`,
    stay: "Your stay",
    footer: (h) => `You are receiving this email because of your booking at ${h}.`,
  },
};

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;

function nights(checkIn: string, checkOut: string): number {
  return Math.round(
    (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000,
  );
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',monospace";

const httpsUrl = (u: string | null | undefined) => (u && /^https:\/\//.test(u) ? u : null);

/** The top of the email, in the style chosen for the hotel. */
function emailHeader(d: BookingEmailData, accent: string): string {
  const logo = httpsUrl(d.header?.logoUrl);
  const image = httpsUrl(d.header?.imageUrl);
  const style = d.header?.style ?? (logo ? "logo" : "color");
  const name = esc(d.hotelName);
  if (style === "image" && image) {
    return `<tr><td style="font-size:0;line-height:0"><img src="${esc(image)}" width="600" alt="${name}" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>
<tr><td style="padding:18px 32px 0;border-top:4px solid ${accent};font-family:${SERIF};font-size:22px;color:#0f172a">${name}</td></tr>`;
  }
  if (style === "logo" && logo) {
    return `<tr><td style="height:6px;background:${accent};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 32px 20px;border-bottom:1px solid #e2e8f0"><img src="${esc(logo)}" alt="${name}" height="56" style="display:block;height:56px;width:auto;max-width:240px;border:0"></td></tr>`;
  }
  return `<tr><td style="background:${accent};padding:28px 32px;font-family:${SERIF};font-size:24px;color:#ffffff">${name}</td></tr>`;
}

export function bookingEmail(d: BookingEmailData): RenderedEmail {
  const L = COPY[d.lang === "en" ? "en" : "es"];
  const eur = (n: number) =>
    n.toLocaleString(L.locale, { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
  const longDate = (ymd: string) =>
    new Date(`${ymd}T12:00:00Z`).toLocaleDateString(L.locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  const instant = (iso: string) =>
    new Date(iso).toLocaleString(L.locale, {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: d.timezone,
    });

  const accent = d.accent && /^#[0-9a-f]{6}$/i.test(d.accent) ? d.accent : "#1e3a5f";
  const n = nights(d.checkIn, d.checkOut);
  const hello = L.hello(d.guestName ? d.guestName.split(/\s+/)[0] : null);
  const confirmed = d.kind === "booking_confirmed";
  const checkin = d.kind === "checkin_invite";
  const subject = checkin
    ? L.checkinSubject(d.hotelName)
    : L.subject(confirmed, d.hotelName, d.reference);

  const payment: string | null = checkin
    ? null
    : !confirmed
      ? d.paid > 0
        ? L.refunded(eur(d.paid))
        : L.nothingCharged
      : d.paymentMode === "at_hotel"
        ? L.atHotel(eur(d.total))
        : d.paid >= d.total
          ? L.paidAll(eur(d.total))
          : L.paidPart(eur(d.total), eur(d.paid));
  const cancellation = !confirmed
    ? null
    : d.freeCancellationUntil && Date.parse(d.freeCancellationUntil) > 0
      ? L.freeUntil(instant(d.freeCancellationUntil))
      : L.noFree;

  const intro = checkin ? L.checkinIntro(d.hotelName) : L.intro(confirmed, d.hotelName);
  const rows: [string, string][] = [
    [L.rows.reference, d.reference],
    [L.rows.room, d.roomName],
    [L.rows.checkIn, L.from(longDate(d.checkIn), hour(d.checkInHour))],
    [L.rows.checkOut, L.until(longDate(d.checkOut), hour(d.checkOutHour))],
    [L.rows.nights, String(n)],
    [L.rows.guests, String(d.guests)],
  ];
  const contact = [d.hotelPhone, d.hotelEmail, d.hotelAddress].filter(Boolean) as string[];
  const cta = checkin ? L.checkinCta : L.cta(confirmed);
  const note = checkin ? L.checkinNote : confirmed ? L.whatNext : null;

  const text = [
    hello,
    "",
    intro,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    ...(payment ? [payment] : []),
    ...(cancellation ? [cancellation] : []),
    "",
    `${cta}: ${d.manageUrl}`,
    ...(note ? [note] : []),
    "",
    d.hotelName,
    ...contact,
  ].join("\n");

  const status = checkin
    ? { label: L.status.checkin, fg: accent, bg: "#f1f5f9" }
    : confirmed
      ? { label: L.status.confirmed, fg: "#166534", bg: "#dcfce7" }
      : { label: L.status.cancelled, fg: "#991b1b", bg: "#fee2e2" };
  const details: [string, string][] = [
    [L.rows.room, d.roomName],
    [L.rows.nights, String(n)],
    [L.rows.guests, String(d.guests)],
  ];
  const dateCell = (label: string, date: string, when: string) =>
    `<td valign="top" width="48%" style="width:48%;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b">${esc(label)}</div>
<div style="margin-top:6px;font-size:15px;font-weight:600;color:#0f172a">${esc(date)}</div>
<div style="margin-top:2px;font-size:13px;color:#475569">${esc(when)}</div></td>`;
  const contactLinks = [
    d.hotelPhone
      ? `<a href="tel:${esc(d.hotelPhone.replace(/[^+\d]/g, ""))}" style="color:#475569;text-decoration:none">${esc(d.hotelPhone)}</a>`
      : "",
    d.hotelEmail
      ? `<a href="mailto:${esc(d.hotelEmail)}" style="color:${accent};text-decoration:none">${esc(d.hotelEmail)}</a>`
      : "",
  ].filter(Boolean);
  const terms =
    payment || cancellation
      ? `<tr><td style="padding:20px 32px 0"><div style="padding:14px 16px;border-left:3px solid ${accent};background:#f8fafc;font-size:14px;line-height:1.5;color:#334155">${
          payment ? `<div>${esc(payment)}</div>` : ""
        }${cancellation ? `<div style="margin-top:${payment ? 6 : 0}px;color:#64748b">${esc(cancellation)}</div>` : ""}</div></td></tr>`
      : "";

  const html = `<!doctype html>
<html lang="${d.lang === "en" ? "en" : "es"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef1f5;font-family:${FONT};color:#1f2937;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
${emailHeader(d, accent)}
<tr><td style="padding:32px 32px 8px">
<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${status.bg};color:${status.fg};font-size:12px;font-weight:600">${esc(status.label)}</span>
<p style="margin:20px 0 8px;font-size:16px;color:#0f172a">${esc(hello)}</p>
<p style="margin:0;font-size:16px;line-height:1.5;color:#334155">${esc(intro)}</p>
</td></tr>
<tr><td style="padding:24px 32px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0"><tr>
<td style="padding:14px 0;font-size:13px;color:#64748b">${esc(L.rows.reference)}</td>
<td align="right" style="padding:14px 0;font-family:${MONO};font-size:18px;font-weight:700;letter-spacing:.12em;color:#0f172a">${esc(d.reference)}</td>
</tr></table></td></tr>
<tr><td style="padding:20px 32px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${dateCell(L.rows.checkIn, longDate(d.checkIn), L.fromHour(hour(d.checkInHour)))}
<td width="12" style="width:12px;min-width:12px;font-size:0;line-height:0">&nbsp;</td>
${dateCell(L.rows.checkOut, longDate(d.checkOut), L.untilHour(hour(d.checkOutHour)))}
</tr></table></td></tr>
<tr><td style="padding:20px 32px 0">
<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:4px">${esc(L.stay)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
${details
  .map(
    ([k, v]) =>
      `<tr><td style="padding:9px 0;color:#64748b;border-bottom:1px solid #f1f5f9">${esc(k)}</td><td align="right" style="padding:9px 0;border-bottom:1px solid #f1f5f9;font-weight:600;color:#0f172a">${esc(v)}</td></tr>`,
  )
  .join("\n")}
</table></td></tr>
${terms}
<tr><td align="center" style="padding:28px 32px 8px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${accent}">
<a href="${esc(d.manageUrl)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background:${accent}">${esc(cta)}</a>
</td></tr></table></td></tr>
${note ? `<tr><td align="center" style="padding:4px 32px 0;font-size:13px;line-height:1.5;color:#64748b">${esc(note)}</td></tr>` : ""}
<tr><td style="padding:32px 32px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0"><tr><td style="padding-top:20px;font-size:13px;line-height:1.6;color:#475569">
<div style="font-family:${SERIF};font-size:16px;color:#0f172a">${esc(d.hotelName)}</div>
${d.hotelAddress ? `<div>${esc(d.hotelAddress)}</div>` : ""}
${contactLinks.length ? `<div>${contactLinks.join(" &middot; ")}</div>` : ""}
</td></tr></table></td></tr>
</table>
<p style="margin:16px 0 0;font-size:11px;color:#94a3b8">${esc(L.footer(d.hotelName))}</p>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}
