// What the hotel has to fix itself (SQL hotel_alerts / hotel_alerts_all): the
// wording shared by the notice in "Hoy" and the email to management, and the
// panel page where each one is fixed.

export interface HotelAlertKind {
  area: string;
  one: string;
  many: string;
  /** Panel path where it is fixed. */
  path: string;
}

export const HOTEL_ALERT_KINDS: Record<string, HotelAlertKind> = {
  ses_blocked: {
    area: "Registro de viajeros",
    one: "parte sin enviar porque faltan datos de los viajeros",
    many: "partes sin enviar porque faltan datos de los viajeros",
    path: "/travellers",
  },
  ses_rejected: {
    area: "Registro de viajeros",
    one: "parte rechazado por el ministerio",
    many: "partes rechazados por el ministerio",
    path: "/travellers",
  },
  ses_error: {
    area: "Registro de viajeros",
    one: "parte que no se pudo enviar (revisa las credenciales)",
    many: "partes que no se pudieron enviar (revisa las credenciales)",
    path: "/travellers",
  },
  verifactu_rejected: {
    area: "Facturas",
    one: "registro rechazado por la AEAT (hay que subsanarlo)",
    many: "registros rechazados por la AEAT (hay que subsanarlos)",
    path: "/invoices",
  },
  email_failed: {
    area: "Emails al huésped",
    one: "email que no llegó (revisa el email del huésped)",
    many: "emails que no llegaron (revisa el email de los huéspedes)",
    path: "/reservations",
  },
  channel_error: {
    area: "Canales",
    one: "envío de disponibilidad rechazado por el canal",
    many: "envíos de disponibilidad rechazados por el canal",
    path: "/channels",
  },
};

export const isHotelAlertKind = (kind: string): boolean => kind in HOTEL_ALERT_KINDS;

/** "1 parte sin enviar…" / "3 partes sin enviar…". */
export function hotelAlertText(kind: string, items: number): string {
  const k = HOTEL_ALERT_KINDS[kind];
  if (!k) return `${items} avisos`;
  return `${items} ${Number(items) === 1 ? k.one : k.many}`;
}
