import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SALES } from "../config";

// Client of the sales project for the admin panel. Created on first use in the
// browser (never during prerendering), and only on the admin page: the public
// pages talk to the leads function with plain fetch.
let client: SupabaseClient | null = null;

export function sales(): SupabaseClient {
  if (!SALES.url || !SALES.key) throw new Error("Falta la configuración de Supabase de ventas");
  client ??= createClient(SALES.url, SALES.key, {
    auth: { persistSession: true, storageKey: "melendos-admin" },
  });
  return client;
}

export const LEAD_STATUSES = {
  new: "Nuevo",
  confirmed: "Confirmado",
  done: "Demo hecha",
  won: "Ganado",
  lost: "Perdido",
  cancelled: "Cancelado",
  no_show: "No se presentó",
} as const;
export type LeadStatus = keyof typeof LEAD_STATUSES;

export interface Lead {
  id: string;
  kind: "demo" | "contact";
  slot_start: string | null;
  name: string;
  email: string;
  phone: string | null;
  company: string;
  hotels: number;
  rooms: number | null;
  plan: string | null;
  message: string | null;
  privacy_ok: boolean;
  marketing_ok: boolean;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
  page: string | null;
  status: LeadStatus;
  notes: string | null;
  created_at: string;
}
