import { useQuery } from "@tanstack/react-query";
import {
  tenantFeatures,
  tenantPackages,
  type Feature,
  type Features,
  type PackageId,
} from "@domain/features.ts";
import { hotelPolicies, type HotelPolicies } from "@domain/policies.ts";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/lib/roles";
import { useBrand } from "@/lib/brand";

/** The hotel (tenant) behind the brand shown on the web and the guest app. */
export function useBrandTenant() {
  const { tenantId } = useBrand();
  return useQuery({
    queryKey: ["brand-tenant", tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("id, slug, name, plan, settings")
        .eq("id", tenantId!)
        .maybeSingle();
      return data as {
        id: string;
        slug: string;
        name: string;
        plan: string;
        settings: unknown;
      } | null;
    },
  });
}

/**
 * Modules of the current hotel (loyalty club, reviews…). Until the hotel is
 * known, optional modules stay hidden rather than flashing in and out.
 */
export function useFeatures(): Features & { ready: boolean } {
  const { data: tenant, isPending } = useBrandTenant();
  if (isPending || !tenant) {
    return { ...tenantFeatures("starter", { features: { loyalty: false } }), ready: !isPending };
  }
  return {
    ...tenantFeatures(tenant.plan, tenant.settings as { features?: Record<string, unknown> }),
    ready: true,
  };
}

/** Payment and cancellation policies of the current hotel. */
export function usePolicies(): HotelPolicies & { ready: boolean } {
  const { data: tenant, isPending } = useBrandTenant();
  return {
    ...hotelPolicies((tenant?.settings ?? {}) as Record<string, unknown>),
    ready: !isPending && !!tenant,
  };
}

export interface StaffHotel {
  id: string;
  name: string;
  plan: string;
  packages: PackageId[];
  features: Features;
  /** Modules switched on or off one by one (settings.features). */
  overrides: Partial<Record<Feature, boolean>>;
}

/** The hotels of the signed-in staff member, with their packages and modules. */
export function useStaffHotelModules() {
  const { tenantIds, loading } = useRoles();
  return useQuery({
    queryKey: ["staff-hotel-modules", tenantIds],
    enabled: !loading,
    queryFn: async (): Promise<StaffHotel[]> => {
      let q = supabase.from("tenants").select("id, name, plan, settings").order("name");
      q = q.in("id", tenantIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((t) => {
        const settings = (t.settings ?? {}) as {
          packages?: unknown;
          features?: Record<string, unknown>;
        };
        const overrides = Object.fromEntries(
          Object.entries(settings.features ?? {}).filter(([, v]) => typeof v === "boolean"),
        ) as Partial<Record<Feature, boolean>>;
        return {
          id: t.id,
          name: t.name,
          plan: t.plan,
          packages: tenantPackages(t.plan, settings),
          features: tenantFeatures(t.plan, settings),
          overrides,
        };
      });
    },
  });
}

/** Whether any of the staff member's hotels has the module (for the menu). */
export function useAnyHotelHas() {
  const { data } = useStaffHotelModules();
  return (feature: Feature) => !!data?.some((h) => h.features[feature]);
}

/** The staff member's hotels that have the module (for per-hotel pages). */
export function useHotelsWith(feature: Feature) {
  const q = useStaffHotelModules();
  return { ...q, data: q.data?.filter((h) => h.features[feature]) };
}

/**
 * The hotel's own website, where "back to the web" goes from the guest app.
 * Each hotel sets it in settings.website_url (the booking engine is embedded
 * there or on a subdomain); without it, the demo's public web.
 */
export function useHotelWebsite(): { href: string; external: boolean } {
  const { data } = useBrandTenant();
  const url = (data?.settings as { website_url?: unknown } | null)?.website_url;
  return typeof url === "string" && /^https?:\/\//.test(url)
    ? { href: url, external: true }
    : { href: "/web", external: false };
}
