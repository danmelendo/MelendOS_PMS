import { useQuery } from "@tanstack/react-query";
import { tenantFeatures, type Features } from "@domain/features.ts";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand";

/** The hotel (tenant) behind the brand shown on the web and the guest app. */
export function useBrandTenant() {
  const { brandId } = useBrand();
  return useQuery({
    queryKey: ["brand-tenant", brandId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: property } = await supabase
        .from("properties")
        .select("tenant_id")
        .eq("brand", brandId)
        .limit(1)
        .maybeSingle();
      if (!property) return null;
      const { data } = await supabase
        .from("tenants")
        .select("id, name, plan, settings")
        .eq("id", property.tenant_id)
        .maybeSingle();
      return data as { id: string; name: string; plan: string; settings: unknown } | null;
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
