// ─────────────────────────────────────────────────────────────────────────────
// SupabaseCmsClient: hotel experiences from the `experiences` table.
//
// Sign-ups are kept in the browser for now; storing them server-side (and
// updating `attending`) is a follow-up.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import type { CmsClient } from "./client";
import type { EventCategory, HotelEvent } from "./types";
import { CATEGORY_ACCENT, loadRsvps, saveRsvps } from "./rsvps";

interface ExperienceRow {
  id: string;
  property_id: string;
  title: string;
  summary: string;
  description: string | null;
  category: string;
  starts_at: string;
  location: string;
  capacity: number;
  attending: number;
  properties: { name: string } | null;
}

function toEvent(r: ExperienceRow, rsvps: Set<string>): HotelEvent {
  const category = r.category as EventCategory;
  const going = rsvps.has(r.id);
  return {
    id: r.id,
    hotelId: r.property_id,
    hotelName: r.properties?.name ?? "",
    title: r.title,
    summary: r.summary,
    description: r.description ?? `${r.summary}. Apúntate para reservar tu plaza.`,
    category,
    startsAt: r.starts_at,
    location: r.location,
    capacity: r.capacity,
    attending: r.attending + (going ? 1 : 0),
    accent: CATEGORY_ACCENT[category] ?? "214 51% 25%",
    going,
  };
}

const COLUMNS =
  "id, property_id, title, summary, description, category, starts_at, location, capacity, attending, properties(name)";

export class SupabaseCmsClient implements CmsClient {
  readonly cmsName = "Demo Stays CMS";

  async listEvents(filter?: { hotelId?: string; upcomingOnly?: boolean }): Promise<HotelEvent[]> {
    let q = supabase.from("experiences").select(COLUMNS).eq("active", true).order("starts_at");
    if (filter?.hotelId) q = q.eq("property_id", filter.hotelId);
    if (filter?.upcomingOnly) q = q.gte("starts_at", new Date().toISOString());
    const { data, error } = await q;
    if (error) throw error;
    const rsvps = loadRsvps();
    return ((data ?? []) as unknown as ExperienceRow[]).map((r) => toEvent(r, rsvps));
  }

  async getEvent(id: string): Promise<HotelEvent | null> {
    const { data } = await supabase.from("experiences").select(COLUMNS).eq("id", id).maybeSingle();
    return data ? toEvent(data as unknown as ExperienceRow, loadRsvps()) : null;
  }

  async setRsvp(eventId: string, going: boolean): Promise<HotelEvent> {
    const rsvps = loadRsvps();
    if (going) rsvps.add(eventId);
    else rsvps.delete(eventId);
    saveRsvps(rsvps);
    const e = await this.getEvent(eventId);
    if (!e) throw new Error("Experiencia no encontrada");
    return e;
  }
}
