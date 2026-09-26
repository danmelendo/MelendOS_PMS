// Why a booking was cancelled, in fixed groups, so reports and the ML models
// learn from a clean label instead of free-text notes. The free text stays as
// an internal note for the staff. Mirrored in SQL by the check constraint on
// reservations.cancellation_category (migration packages_and_cancellations).

export const CANCELLATION_CATEGORIES = {
  change_of_plans: "Cambio de planes",
  personal: "Enfermedad o motivo personal",
  work: "Motivos de trabajo",
  travel_disruption: "Problemas con el viaje o el transporte",
  found_alternative: "Encontró otro alojamiento o mejor precio",
  booking_error: "Error al reservar o reserva duplicada",
  payment_not_completed: "Pago no completado",
  hotel_initiated: "Cancelada por el hotel (avería, sobreventa…)",
  force_majeure: "Meteorología o fuerza mayor",
  no_reason: "Sin motivo indicado",
  other: "Otro",
} as const;

export type CancellationCategory = keyof typeof CANCELLATION_CATEGORIES;

export const CANCELLATION_CATEGORY_IDS = Object.keys(
  CANCELLATION_CATEGORIES,
) as CancellationCategory[];

/** What a guest can choose (the rest are set by the hotel or the system). */
export const GUEST_CANCELLATION_CATEGORIES: CancellationCategory[] = [
  "change_of_plans",
  "personal",
  "work",
  "travel_disruption",
  "found_alternative",
  "booking_error",
  "force_majeure",
  "other",
];

export const isCancellationCategory = (v: unknown): v is CancellationCategory =>
  typeof v === "string" && v in CANCELLATION_CATEGORIES;
