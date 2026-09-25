import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DiscountType = "percent" | "fixed";

export interface PromoCode {
  id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  valid_from: string;
  valid_until: string | null;
  single_use: boolean;
  max_uses: number | null;
  times_used: number;
  active: boolean;
  archived: boolean;
  created_at: string;
}

/** Lists every promo code (active and archived), newest first. */
export function usePromoCodes() {
  return useQuery({
    queryKey: ["promo_codes"],
    queryFn: async (): Promise<PromoCode[]> => {
      // Archive anything that just expired before listing, so the UI is accurate.
      await supabase.rpc("archive_expired_promo_codes");
      const { data, error } = await supabase
        .from("promo_codes")
        .select("*")
        .order("archived", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PromoCode[];
    },
  });
}

/** Human-readable discount, e.g. "15 %" or "10,00 €". */
export function formatDiscount(p: Pick<PromoCode, "discount_type" | "discount_value">) {
  return p.discount_type === "percent"
    ? `${p.discount_value.toLocaleString("es-ES")} %`
    : p.discount_value.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

/** Discount in euros for a given room subtotal (extras are always excluded). */
export function discountEurosForRoom(
  p: Pick<PromoCode, "discount_type" | "discount_value">,
  roomSubtotal: number,
): number {
  const raw =
    p.discount_type === "percent"
      ? (roomSubtotal * p.discount_value) / 100
      : Math.min(p.discount_value, roomSubtotal); // fixed amount can't exceed the room price
  return Math.round(Math.max(0, raw) * 100) / 100;
}
