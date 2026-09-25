// ─────────────────────────────────────────────────────────────────────────────
// CMS connector — integration contract
//
// The "Experiencias" sections of the app and the public web read hotel events
// only through this interface. Demo Stays ships a reference implementation
// (DemoCmsClient) over an in-memory dataset; pointing at a real headless CMS
// means writing another `CmsClient` and swapping the singleton in ./index.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { HotelEvent } from "./types";

export interface CmsClient {
  /** Human-readable id of the CMS behind this client (shown in the UI). */
  readonly cmsName: string;

  /** Events for one hotel, or across all hotels when omitted. */
  listEvents(filter?: { hotelId?: string; upcomingOnly?: boolean }): Promise<HotelEvent[]>;
  getEvent(id: string): Promise<HotelEvent | null>;

  /** Toggle the current guest's sign-up for an event; returns the updated event. */
  setRsvp(eventId: string, going: boolean): Promise<HotelEvent>;
}
