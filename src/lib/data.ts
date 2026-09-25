import { useQuery } from "@tanstack/react-query";
import { IS_DEMO, supabase } from "@/integrations/supabase/client";
import { useRoles } from "./roles";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];
export type Room = Tables["rooms"]["Row"];
export type RateGroup = Tables["rate_groups"]["Row"];
export type RateNightly = Tables["rate_nightly"]["Row"];
export type Extra = Tables["extras"]["Row"];
export type Customer = Tables["customers"]["Row"];
export type Reservation = Tables["reservations"]["Row"];
export type ReservationExtra = Tables["reservation_extras"]["Row"];
export type DynamicRule = Tables["dynamic_rules"]["Row"];
export type GiftThreshold = Tables["gift_thresholds"]["Row"];

// Hotels. Each room's `building` holds its hotel; normalised to a key for
// filtering/grouping across the panel.
export const HOTELS: { key: string; label: string }[] = [
  { key: "lumen", label: "Hotel Lumen" },
  { key: "albora", label: "Albora Hotel & Spa" },
];

export function buildingKey(building: string | null | undefined): string {
  return (building ?? "").toLowerCase();
}

// Hotel check-in / check-out times. Every stay is priced per night.
export const CHECKIN_HOUR = 15; // 15:00
export const CHECKOUT_HOUR = 12; // 12:00

export type ExtraCategory = Database["public"]["Enums"]["extra_category"];
export const EXTRA_CATEGORIES: readonly ExtraCategory[] = [
  "breakfast",
  "parking",
  "wellness",
  "experiences",
  "services",
];
export const EXTRA_CATEGORY_LABELS: Record<ExtraCategory, string> = {
  breakfast: "Desayuno y restauración",
  parking: "Parking y traslados",
  wellness: "Spa y bienestar",
  experiences: "Experiencias",
  services: "Servicios",
};

export const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente de pago",
  confirmed: "Confirmada",
  in_progress: "En curso",
  completed: "Finalizada",
  cancelled: "Cancelada",
  no_show: "No-show",
  rejected: "Rechazada",
};
export const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gold/15 text-gold-foreground border-gold/40",
  confirmed: "bg-info/15 text-info-foreground border-info/40",
  in_progress: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 line-through",
  no_show: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
};

// The catalogue is public (the web needs it), so the staff panel must scope its
// queries to the signed-in user's hotels itself. RLS still guards every write.
// In the backend-free demo the staff user runs both hotels: no filter.
function useStaffTenants() {
  const { tenantIds, loading } = useRoles();
  return { tenantIds, ready: IS_DEMO || !loading };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scoped<Q extends { in: (c: string, v: string[]) => any }>(q: Q, tenantIds: string[]): Q {
  return IS_DEMO ? q : q.in("tenant_id", tenantIds);
}

export function useRooms() {
  const { tenantIds, ready } = useStaffTenants();
  return useQuery({
    queryKey: ["rooms", tenantIds],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await scoped(
        supabase.from("rooms").select("*, rate_groups(name)"),
        tenantIds,
      ).order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export function useExtras() {
  const { tenantIds, ready } = useStaffTenants();
  return useQuery({
    queryKey: ["extras", tenantIds],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await scoped(supabase.from("extras").select("*"), tenantIds).order(
        "sort_order",
      );
      if (error) throw error;
      return data;
    },
  });
}

export function useRateGroups() {
  const { tenantIds, ready } = useStaffTenants();
  return useQuery({
    queryKey: ["rate_groups", tenantIds],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await scoped(
        supabase.from("rate_groups").select("*"),
        tenantIds,
      ).order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useDynamicRules() {
  const { tenantIds, ready } = useStaffTenants();
  return useQuery({
    queryKey: ["dynamic_rules", tenantIds],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await scoped(
        supabase.from("dynamic_rules").select("*"),
        tenantIds,
      ).order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function eur(n: number | null | undefined) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n ?? 0);
}
