import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { HotelLegal } from "./legal-texts";

export * from "./legal-texts";

export function useHotelLegal(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["hotel-legal", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<HotelLegal | null> => {
      const { data, error } = await supabase.rpc("hotel_legal", { p_tenant: tenantId! });
      if (error) throw error;
      return (data as unknown as HotelLegal | null) ?? null;
    },
  });
}
