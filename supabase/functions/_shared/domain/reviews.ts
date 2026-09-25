// Guest reviews: shared labels and rules (the database mirrors reviewAuthor in
// public.review_author).

export const REVIEW_SCORES = {
  cleanliness: "Limpieza",
  staff: "Personal",
  location: "Ubicación",
  comfort: "Confort",
  value: "Calidad-precio",
} as const;
export type ReviewScore = keyof typeof REVIEW_SCORES;

/** Public author name: first name and initial of the surname ("Laura G."). */
export function reviewAuthor(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Huésped";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}
