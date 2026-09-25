// Stay extension requested by the guest: the extra nights are priced with the
// same engine as a booking (quoteStay) and must be free; reception approves
// the request (public.decide_extension), which moves the check-out.
// Shared by the stays-extend Edge Function, the demo mock and, later, the
// booking agent.
import { z } from "zod";
import { isYmd, nightsBetween, ymdInZone } from "../domain/dates.ts";
import { BookingError, quoteStay, type BookingStore } from "./bookings.ts";

export const MAX_EXTENSION_NIGHTS = 14;

export const extensionInput = z.object({
  reservation_id: z.string().min(1),
  new_check_out: z.string().refine(isYmd, "Fecha no válida (yyyy-MM-dd)"),
});

export interface ExtensionReservation {
  id: string;
  tenant_id: string;
  room_id: string;
  status: string;
  end_at: string;
  people: number;
}

export interface ExtensionStore extends BookingStore {
  insertExtension(row: {
    tenant_id: string;
    reservation_id: string;
    new_check_out: string;
    new_end_at: string;
    nights: number;
    amount: number;
  }): Promise<{ id: string } | "already_pending">;
  /** Tells reception in the stay's chat. */
  notify(tenantId: string, reservationId: string, body: string): Promise<void>;
}

export interface ExtensionQuote {
  id: string;
  new_check_out: string;
  nights: number;
  amount: number;
}

const longDate = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

/**
 * Prices the extra nights and files the request. The caller has already
 * checked that the guest owns the booking (token or account).
 */
export async function requestExtension(
  store: ExtensionStore,
  reservation: ExtensionReservation,
  raw: unknown,
  now = new Date(),
): Promise<ExtensionQuote> {
  const parsed = extensionInput.safeParse(raw);
  if (!parsed.success) throw new BookingError("invalid", parsed.error.issues[0].message);
  if (!["confirmed", "in_progress"].includes(reservation.status)) {
    throw new BookingError("invalid", "Solo se puede ampliar una estancia confirmada o en curso");
  }
  const settings = await store.getTenantSettings(reservation.tenant_id);
  const checkOut = ymdInZone(reservation.end_at, settings.timezone);
  const target = parsed.data.new_check_out;
  const nights = nightsBetween(checkOut, target);
  if (nights < 1)
    throw new BookingError("invalid", "La nueva salida debe ser posterior a la actual");
  if (nights > MAX_EXTENSION_NIGHTS) {
    throw new BookingError("invalid", `Como máximo ${MAX_EXTENSION_NIGHTS} noches más`);
  }

  // The extra nights, in the same room.
  const quote = await quoteStay(
    store,
    {
      room_id: reservation.room_id,
      check_in: checkOut,
      check_out: target,
      guests: reservation.people,
    },
    { userId: null, channel: "public", tenantId: reservation.tenant_id, now },
  );
  if (!quote.available) {
    throw new BookingError("unavailable", "La habitación no está libre esas noches");
  }

  const amount = quote.breakdown.total;
  const saved = await store.insertExtension({
    tenant_id: reservation.tenant_id,
    reservation_id: reservation.id,
    new_check_out: target,
    new_end_at: quote.endAt.toISOString(),
    nights,
    amount,
  });
  if (saved === "already_pending") {
    throw new BookingError("invalid", "Ya tienes una ampliación pendiente de confirmar");
  }
  await store.notify(
    reservation.tenant_id,
    reservation.id,
    `Solicito ampliar la estancia hasta el ${longDate(target)} (${nights} ${
      nights === 1 ? "noche" : "noches"
    } más, ${amount.toFixed(2).replace(".", ",")} €).`,
  );
  return { id: saved.id, new_check_out: target, nights, amount };
}
