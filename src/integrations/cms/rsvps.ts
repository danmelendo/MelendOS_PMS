// Experience sign-ups and category colours shared by the CMS clients. Sign-ups
// are kept in the browser for now; storing them server-side is a follow-up.
import type { EventCategory } from "./types";

const RSVP_KEY = "stays-cms-rsvp";

// Muted accents that sit well next to the navy/gold palette.
export const CATEGORY_ACCENT: Record<EventCategory, string> = {
  gastronomy: "35 45% 38%",
  wellness: "170 30% 32%",
  culture: "260 22% 38%",
  outdoor: "200 45% 34%",
  family: "350 35% 42%",
};

export function loadRsvps(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(window.localStorage.getItem(RSVP_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function saveRsvps(set: Set<string>) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(RSVP_KEY, JSON.stringify([...set]));
  }
}
