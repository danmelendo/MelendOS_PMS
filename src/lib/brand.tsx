// ─────────────────────────────────────────────────────────────────────────────
// Brand layer: one booking engine, one brand per hotel.
//
// Each hotel is a tenant with its own web identity (name, colour, texts, logo
// and photos) in tenants.brand, edited from the panel ("Web y dominio"). The
// public web and the guest app resolve the hotel from the host name:
// 1. the hotel's own (sub)domain, tenants.domain (e.g. reservas.suhotel.com,
//    a CNAME to the platform);
// 2. <slug>.<VITE_PLATFORM_DOMAIN> (the subdomain every hotel gets);
// 3. otherwise the demo: a switcher between the hotels, remembered in the
//    browser. On a hotel's domain there is no switcher.
// The accent is exposed as the `--brand` CSS variable, so every screen
// re-skins without knowing which hotel it shows.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { brandOf, hostHotel, type Brand, type BrandId, type TenantRow } from "@/lib/hotel-web";

export type { Brand, BrandId } from "@/lib/hotel-web";

/** Shown until the hotel is known (no other hotel's name flashes on a domain). */
const PLACEHOLDER: Brand = brandOf({
  id: "",
  slug: "",
  name: "",
  domain: null,
  brand: { accent: "#1F3A5F" },
  settings: null,
});

const KEY = "stays-brand";
/** Old demo keys, before brands came from the database. */
const LEGACY: Record<string, string> = { urban: "hotel-lumen", coast: "albora-hotel-spa" };

interface BrandCtx {
  brand: Brand;
  brandId: BrandId;
  tenantId: string | null;
  setBrand: (id: BrandId) => void;
  /** Hotels of the demo switcher (empty on a hotel's own domain). */
  hotels: Brand[];
  /** The host name fixes the hotel: no switcher. */
  locked: boolean;
  ready: boolean;
}

const Ctx = createContext<BrandCtx | null>(null);

const COLUMNS = "id, slug, name, domain, brand, settings";

function readSaved(): string | null {
  if (typeof window === "undefined") return null;
  // ?hotel=<slug> picks the hotel (links from the embedded widget, demos);
  // a hotel's own domain still wins.
  const param = new URLSearchParams(window.location.search).get("hotel");
  if (param && /^[a-z0-9-]{3,40}$/.test(param)) return param;
  try {
    const v = window.localStorage.getItem(KEY);
    return v ? (LEGACY[v] ?? v) : null;
  } catch {
    return null;
  }
}

export function BrandProvider({ children }: { children: ReactNode }) {
  const host = typeof window === "undefined" ? null : hostHotel(window.location.hostname);
  const [chosen, setChosen] = useState<string | null>(readSaved);

  const { data, isLoading } = useQuery({
    queryKey: ["brand-hotels", host?.domain ?? host?.slug ?? "demo"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      let q = supabase.from("tenants").select(COLUMNS).order("name");
      if (host?.domain) q = q.eq("domain", host.domain);
      else if (host?.slug) q = q.eq("slug", host.slug);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as TenantRow[]).map(brandOf);
    },
  });

  // A hotel's host that matches no hotel falls back to the demo list.
  const locked = !!host && !!data?.length;
  const hotels = useMemo(() => data ?? [], [data]);
  const brand =
    (locked
      ? hotels[0]
      : (hotels.find((h) => h.id === chosen) ??
        hotels.find((h) => h.id === "hotel-lumen") ??
        hotels[0])) ?? PLACEHOLDER;

  useEffect(() => {
    if (typeof window === "undefined" || !brand.id) return;
    document.documentElement.style.setProperty("--brand", brand.accent);
    if (!locked) {
      try {
        window.localStorage.setItem(KEY, brand.id);
      } catch {
        /* private mode: the choice is not remembered */
      }
    }
  }, [brand.id, brand.accent, locked]);

  const value = useMemo<BrandCtx>(
    () => ({
      brand,
      brandId: brand.id,
      tenantId: brand.tenantId,
      setBrand: setChosen,
      hotels: locked ? [] : hotels,
      locked,
      ready: !isLoading && !!brand.id,
    }),
    [brand, hotels, locked, isLoading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBrand() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBrand must be used inside BrandProvider");
  return c;
}
