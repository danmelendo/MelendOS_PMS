// Emails to the guest about their booking (confirmation, cancellation), in the
// guest's language (Spanish or English, chosen on the booking web), plain HTML
// with inline styles so every mail client shows them the same. Pure: the
// dispatcher loads the data and sends what this returns.

export type BookingEmailKind = "booking_confirmed" | "booking_cancelled";
export type EmailLang = "es" | "en";

export interface BookingEmailData {
  kind: BookingEmailKind;
  /** The guest's language; Spanish when unknown. */
  lang?: EmailLang | null;
  hotelName: string;
  /** Brand colour (#rrggbb); falls back to a neutral navy. */
  accent: string | null;
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
  const subject = L.subject(confirmed, d.hotelName, d.reference);

  const payment = !confirmed
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

  const intro = L.intro(confirmed, d.hotelName);
  const rows: [string, string][] = [
    [L.rows.reference, d.reference],
    [L.rows.room, d.roomName],
    [L.rows.checkIn, L.from(longDate(d.checkIn), hour(d.checkInHour))],
    [L.rows.checkOut, L.until(longDate(d.checkOut), hour(d.checkOutHour))],
    [L.rows.nights, String(n)],
    [L.rows.guests, String(d.guests)],
  ];
  const contact = [d.hotelPhone, d.hotelEmail, d.hotelAddress].filter(Boolean) as string[];
  const cta = L.cta(confirmed);

  const text = [
    hello,
    "",
    intro,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    payment,
    ...(cancellation ? [cancellation] : []),
    "",
    `${cta}: ${d.manageUrl}`,
    ...(confirmed ? [L.whatNext] : []),
    "",
    d.hotelName,
    ...contact,
  ].join("\n");

  const html = `<!doctype html>
<html lang="${d.lang === "en" ? "en" : "es"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff">
<tr><td style="background:${accent};padding:20px 24px;color:#ffffff;font-size:20px;font-weight:bold">${esc(d.hotelName)}</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px;font-size:15px">${esc(hello)}</p>
<p style="margin:0 0 20px;font-size:15px;font-weight:bold">${esc(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-top:1px solid #e5e7eb">
${rows
  .map(
    ([k, v]) =>
      `<tr><td style="padding:8px 0;color:#6b7280;border-bottom:1px solid #e5e7eb;width:38%">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-weight:bold">${esc(v)}</td></tr>`,
  )
  .join("\n")}
</table>
<p style="margin:20px 0 4px;font-size:14px">${esc(payment)}</p>
${cancellation ? `<p style="margin:0 0 4px;font-size:14px;color:#6b7280">${esc(cancellation)}</p>` : ""}
<p style="margin:24px 0"><a href="${esc(d.manageUrl)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;font-size:14px">${esc(cta)}</a></p>
${confirmed ? `<p style="margin:0;font-size:13px;color:#6b7280">${esc(L.whatNext)}</p>` : ""}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">${[d.hotelName, ...contact].map(esc).join(" · ")}</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}
