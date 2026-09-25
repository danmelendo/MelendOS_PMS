/**
 * Short booking reference a guest can read out: the first 8 hex digits of the
 * reservation id, upper case. Same rule as the generated column
 * `reservations.reference` in the database.
 */
export function bookingReference(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}
