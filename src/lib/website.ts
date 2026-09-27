import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { brandOf, hotelWebUrl, type TenantRow } from "@/lib/hotel-web";

// The hotel's web for the panel ("Web y dominio"): its identity, where its
// booking web answers and its own domain (docs/web-y-dominio.md).

export const PLATFORM_CNAME = (import.meta.env.VITE_PLATFORM_CNAME as string | undefined) ?? "";

export function useHotelWeb(tenantId: string | null) {
  return useQuery({
    queryKey: ["hotel-web", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, slug, name, domain, brand, settings")
        .eq("id", tenantId!)
        .single();
      if (error) throw new Error(error.message);
      const row = data as unknown as TenantRow;
      return { row, brand: brandOf(row), url: hotelWebUrl(row) };
    },
  });
}

export function useSaveHotelWeb(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: r, error } = await supabase.rpc(
        "save_hotel_web" as never,
        {
          p_tenant: tenantId,
          p_data: data,
        } as never,
      );
      if (error) throw new Error(error.message);
      return r;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["hotel-web"] });
      qc.invalidateQueries({ queryKey: ["brand-hotels"] });
      qc.invalidateQueries({ queryKey: ["brand-tenant"] });
    },
  });
}

export type DnsCheck =
  | { ok: true; target: string }
  | { ok: false; reason: string; found?: string | null };

/**
 * Whether a (sub)domain already points to the platform: public DNS over HTTPS
 * (no server of ours involved). The CNAME can take minutes or hours to spread.
 */
export async function checkCname(domain: string, expected: string): Promise<DnsCheck> {
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=CNAME`,
    { headers: { accept: "application/dns-json" } },
  );
  if (!res.ok) return { ok: false, reason: "No se pudo consultar el DNS ahora mismo" };
  const body = (await res.json()) as { Answer?: { type: number; data: string }[] };
  const found = body.Answer?.find((a) => a.type === 5)?.data.replace(/\.$/, "") ?? null;
  if (!found) return { ok: false, reason: "Aún no hay un registro CNAME para ese dominio", found };
  if (expected && found.toLowerCase() !== expected.toLowerCase())
    return { ok: false, reason: `El CNAME apunta a ${found}, no a ${expected}`, found };
  return { ok: true, target: found };
}
