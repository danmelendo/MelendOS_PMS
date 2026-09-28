import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// "Habitaciones en oferta" on the hotel's booking web: date sales (price rules
// that lower every room on some nights) and the promo codes the hotel publishes.
// Both are applied by the booking engine on the server; this only shows them.

export interface HotelSale {
  name: string;
  /** e.g. 15 for "−15 %". */
  discount_pct: number;
  /** First and last discounted night (yyyy-MM-dd), from today on. */
  from: string;
  to: string;
}

export interface PublishedPromo {
  code: string;
  headline: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  valid_until: string | null;
}

export interface HotelOffers {
  sales: HotelSale[];
  promos: PublishedPromo[];
}

export function useHotelOffers(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["hotel-offers", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<HotelOffers> => {
      const { data, error } = await supabase.rpc("hotel_offers", { p_tenant: tenantId! });
      if (error) throw error;
      const d = (data ?? {}) as Partial<HotelOffers>;
      return { sales: d.sales ?? [], promos: d.promos ?? [] };
    },
  });
}

export interface AppliedPromo {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
}

/** A promo code the guest typed, if the hotel accepts it now (null if not). */
export async function findPromo(tenantId: string, code: string): Promise<AppliedPromo | null> {
  const { data, error } = await supabase.rpc("validate_promo_code", {
    p_tenant: tenantId,
    p_code: code,
  });
  if (error) throw new Error("No se pudo comprobar el código");
  const row = (data as AppliedPromo[] | null)?.[0];
  return row ?? null;
}
