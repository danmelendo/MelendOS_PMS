// ─────────────────────────────────────────────────────────────────────────────
// DemoCmsClient — reference CMS client
//
// Serves hotel experiences from an in-memory dataset (the stand-in for a headless
// CMS endpoint). RSVPs are persisted in localStorage so "voy / no voy" survives a
// reload without a backend. A real client would call the CMS HTTP/GraphQL API and
// post RSVPs to the PMS.
// ─────────────────────────────────────────────────────────────────────────────

import type { CmsClient } from "./client";
import type { HotelEvent, EventCategory } from "./types";

export const RSVP_KEY = "stays-cms-rsvp";

const HOTEL_NAMES: Record<string, string> = {
  "prop-lumen": "Hotel Lumen",
  "prop-albora": "Albora Hotel & Spa",
};

// Muted accents that sit well next to the navy/gold palette.
export const CATEGORY_ACCENT: Record<EventCategory, string> = {
  gastronomy: "35 45% 38%",
  wellness: "170 30% 32%",
  culture: "260 22% 38%",
  outdoor: "200 45% 34%",
  family: "350 35% 42%",
};

// [hotelId, title, summary, category, dayOffset, hour, location, capacity, attending]
type EventDef = [string, string, string, EventCategory, number, number, string, number, number];

const EVENT_DEFS: EventDef[] = [
  [
    "prop-lumen",
    "Cata de vinos valencianos",
    "Cuatro vinos de la D.O. con quesos locales",
    "gastronomy",
    2,
    20,
    "Bar del lobby",
    16,
    11,
  ],
  [
    "prop-lumen",
    "Ruta guiada por el casco antiguo",
    "Paseo de dos horas con guía oficial",
    "culture",
    3,
    10,
    "Salida desde recepción",
    20,
    14,
  ],
  [
    "prop-lumen",
    "Sunset en el rooftop",
    "DJ y cócteles de autor al atardecer",
    "gastronomy",
    5,
    19,
    "Rooftop",
    60,
    38,
  ],
  [
    "prop-lumen",
    "Yoga en la terraza",
    "Sesión suave para todos los niveles",
    "wellness",
    6,
    8,
    "Rooftop",
    14,
    6,
  ],
  [
    "prop-lumen",
    "Ruta en bici por el antiguo cauce del río",
    "Bicis incluidas, ritmo tranquilo",
    "outdoor",
    8,
    10,
    "Salida desde recepción",
    12,
    7,
  ],
  [
    "prop-albora",
    "Paella en la playa",
    "Show cooking con el chef del hotel",
    "gastronomy",
    1,
    13,
    "Chiringuito Albora",
    40,
    29,
  ],
  [
    "prop-albora",
    "Kayak al amanecer",
    "Travesía guiada por la bahía",
    "outdoor",
    3,
    8,
    "Embarcadero",
    12,
    9,
  ],
  [
    "prop-albora",
    "Ritual de spa en pareja",
    "Circuito termal y masaje de 30 min",
    "wellness",
    4,
    17,
    "Spa Albora",
    8,
    5,
  ],
  [
    "prop-albora",
    "Taller infantil de castillos de arena",
    "Para peques de 4 a 10 años",
    "family",
    5,
    11,
    "Playa del hotel",
    20,
    12,
  ],
  [
    "prop-albora",
    "Visita al casco antiguo de Altea",
    "Paseo por las calles blancas y el mirador",
    "culture",
    7,
    18,
    "Salida desde recepción",
    18,
    10,
  ],
];

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

function buildEvents(): HotelEvent[] {
  const now = new Date();
  return EVENT_DEFS.map(
    ([hotelId, title, summary, category, dayOffset, hour, location, capacity, attending], i) => {
      const d = new Date(now);
      d.setDate(d.getDate() + dayOffset);
      d.setHours(hour, 0, 0, 0);
      return {
        id: `evt-${i + 1}`,
        hotelId,
        hotelName: HOTEL_NAMES[hotelId] ?? "Demo Stays",
        title,
        summary,
        description: `${summary}. Una experiencia para huéspedes de ${HOTEL_NAMES[hotelId] ?? "nuestros hoteles"}; apúntate para reservar tu plaza.`,
        category,
        startsAt: d.toISOString(),
        location,
        capacity,
        attending,
        accent: CATEGORY_ACCENT[category],
        going: false,
      };
    },
  );
}

export class DemoCmsClient implements CmsClient {
  readonly cmsName = "Demo Stays CMS";
  private events = buildEvents();

  private decorate(e: HotelEvent, rsvps: Set<string>): HotelEvent {
    const going = rsvps.has(e.id);
    return { ...e, going, attending: e.attending + (going ? 1 : 0) };
  }

  async listEvents(filter?: { hotelId?: string; upcomingOnly?: boolean }): Promise<HotelEvent[]> {
    const rsvps = loadRsvps();
    const nowMs = Date.now();
    return this.events
      .filter((e) => (filter?.hotelId ? e.hotelId === filter.hotelId : true))
      .filter((e) => (filter?.upcomingOnly ? new Date(e.startsAt).getTime() >= nowMs : true))
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      .map((e) => this.decorate(e, rsvps));
  }

  async getEvent(id: string): Promise<HotelEvent | null> {
    const e = this.events.find((x) => x.id === id);
    return e ? this.decorate(e, loadRsvps()) : null;
  }

  async setRsvp(eventId: string, going: boolean): Promise<HotelEvent> {
    const rsvps = loadRsvps();
    if (going) rsvps.add(eventId);
    else rsvps.delete(eventId);
    saveRsvps(rsvps);
    const e = this.events.find((x) => x.id === eventId);
    if (!e) throw new Error("Evento no encontrado");
    return this.decorate(e, rsvps);
  }
}
