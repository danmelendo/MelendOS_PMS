// ─────────────────────────────────────────────────────────────────────────────
// CMS connector — domain types
//
// Hotel experiences (tastings, tours, spa sessions…) are content, not PMS data,
// so they come from a separate CMS endpoint (headless CMS: Contentful, Strapi,
// Sanity…). The guest app and the public web read them through this client; the
// demo ships a reference implementation backed by an in-memory dataset. Each
// hotel has its own agenda.
// ─────────────────────────────────────────────────────────────────────────────

export type EventCategory = "gastronomy" | "wellness" | "culture" | "outdoor" | "family";

export interface HotelEvent {
  id: string;
  /** Maps to a PMS property (hotel) id, e.g. "prop-lumen". */
  hotelId: string;
  hotelName: string;
  title: string;
  summary: string;
  description: string;
  category: EventCategory;
  /** ISO datetime of the event start. */
  startsAt: string;
  location: string;
  capacity: number;
  attending: number;
  /** HSL accent triplet for theming the card. */
  accent: string;
  /** Whether the current guest has signed up (filled in by the demo client). */
  going: boolean;
}
