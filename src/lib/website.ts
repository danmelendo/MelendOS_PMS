import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { runtimeConfig } from "@/lib/runtime-config";
import { brandOf, hotelWebUrl, type TenantRow } from "@/lib/hotel-web";

// The hotel's web for the panel ("Web y dominio"): its identity, where its
// booking web answers and its own domain (docs/web-y-dominio.md).

export const PLATFORM_CNAME =
  runtimeConfig.platformCname ?? (import.meta.env.VITE_PLATFORM_CNAME as string | undefined) ?? "";

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

export type HotelWebData = NonNullable<ReturnType<typeof useHotelWeb>["data"]>;

/** Formats the hotel-media bucket accepts. */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};
const MAX_BYTES = 5 * 1024 * 1024;

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Shrinks a photo in the browser (longest side ≤ 2000 px) so the web stays
 * fast. WebP when the browser can write it (Safari cannot: it silently gives
 * PNG), otherwise JPEG, or PNG for images with transparency such as logos.
 */
async function shrink(file: File, keepAlpha: boolean): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const webp = await canvasBlob(canvas, "image/webp", 0.85);
  if (webp?.type === "image/webp") return webp;
  const fallback = keepAlpha
    ? await canvasBlob(canvas, "image/png")
    : await canvasBlob(canvas, "image/jpeg", 0.85);
  if (!fallback) throw new Error("No se pudo procesar la imagen");
  return fallback;
}

/**
 * Uploads a photo of the hotel's template web to its folder of the public
 * hotel-media bucket (shrunk first) and returns its public URL.
 */
export async function uploadHotelImage(
  tenantId: string,
  kind: string,
  file: File,
): Promise<string> {
  let body: Blob;
  try {
    body = await shrink(file, kind === "logo");
  } catch {
    // The browser cannot read it (e.g. HEIC photos from an iPhone on Windows):
    // upload it as it is if the web can show it.
    if (!ACCEPTED.includes(file.type))
      throw new Error(
        "Formato no admitido: usa JPG, PNG o WebP (las fotos HEIC del iPhone, expórtalas como JPG)",
      );
    body = file;
  }
  if (!ACCEPTED.includes(body.type)) throw new Error("Formato no admitido: usa JPG, PNG o WebP");
  if (body.size > MAX_BYTES) throw new Error("La imagen pesa más de 5 MB incluso reducida");
  const path = `${tenantId}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${EXT[body.type]}`;
  const { error } = await supabase.storage
    .from("hotel-media")
    .upload(path, body, { contentType: body.type, upsert: false });
  if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`);
  return supabase.storage.from("hotel-media").getPublicUrl(path).data.publicUrl;
}
