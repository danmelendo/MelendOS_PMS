// Emails to the guest about their booking (confirmation, cancellation), in
// Spanish, plain HTML with inline styles so every mail client shows them the
// same. Pure: the dispatcher loads the data and sends what this returns.

export type BookingEmailKind = "booking_confirmed" | "booking_cancelled";

export interface BookingEmailData {
  kind: BookingEmailKind;
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

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const eur = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

function longDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function instant(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;

function nights(checkIn: string, checkOut: string): number {
  return Math.round(
    (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000,
  );
}

export function bookingEmail(d: BookingEmailData): RenderedEmail {
  const accent = d.accent && /^#[0-9a-f]{6}$/i.test(d.accent) ? d.accent : "#1e3a5f";
  const n = nights(d.checkIn, d.checkOut);
  const hello = d.guestName ? `Hola, ${d.guestName.split(/\s+/)[0]}:` : "Hola:";
  const confirmed = d.kind === "booking_confirmed";
  const subject = confirmed
    ? `Reserva confirmada en ${d.hotelName} · ${d.reference}`
    : `Reserva cancelada en ${d.hotelName} · ${d.reference}`;

  const payment = !confirmed
    ? d.paid > 0
      ? `Pagaste ${eur(d.paid)} online: el hotel tramita la devolución que corresponda según las condiciones que aceptaste.`
      : "No se ha cobrado nada."
    : d.paymentMode === "at_hotel"
      ? `Total ${eur(d.total)}, que pagas en el hotel.`
      : d.paid >= d.total
        ? `Total ${eur(d.total)}, pagado.`
        : `Total ${eur(d.total)}; pagado ${eur(d.paid)}.`;
  const cancellation = !confirmed
    ? null
    : d.freeCancellationUntil && Date.parse(d.freeCancellationUntil) > 0
      ? `Cancelación gratuita hasta el ${instant(d.freeCancellationUntil, d.timezone)}.`
      : "Esta reserva no tiene cancelación gratuita.";

  const intro = confirmed
    ? `Tu reserva en ${d.hotelName} está confirmada.`
    : `Tu reserva en ${d.hotelName} está cancelada.`;
  const rows: [string, string][] = [
    ["Referencia", d.reference],
    ["Habitación", d.roomName],
    ["Entrada", `${longDate(d.checkIn)}, desde las ${hour(d.checkInHour)}`],
    ["Salida", `${longDate(d.checkOut)}, hasta las ${hour(d.checkOutHour)}`],
    ["Noches", String(n)],
    ["Huéspedes", String(d.guests)],
  ];
  const contact = [d.hotelPhone, d.hotelEmail, d.hotelAddress].filter(Boolean) as string[];
  const cta = confirmed ? "Ver o gestionar mi reserva" : "Ver mi reserva";

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
    ...(confirmed
      ? ["Desde ahí puedes hacer el check-in online, escribir a recepción o cancelar."]
      : []),
    "",
    d.hotelName,
    ...contact,
  ].join("\n");

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
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
${confirmed ? `<p style="margin:0;font-size:13px;color:#6b7280">Desde ahí puedes hacer el check-in online, escribir a recepción o cancelar.</p>` : ""}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">${[d.hotelName, ...contact].map(esc).join(" · ")}</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}
