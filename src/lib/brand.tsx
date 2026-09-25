// ─────────────────────────────────────────────────────────────────────────────
// Brand layer: one tech base, two hotels.
//
// Each hotel is a tenant with its own brand (name, accent colour, copy) on the
// same booking engine, payments and management stack. A single config object
// swaps what the public web and guest app show, while every screen, the PMS
// connector and the backend stay identical. The active brand is persisted in
// localStorage and exposes its accent as the `--brand` CSS variable, so the web
// and the app re-skin live from the switcher. A production build would resolve
// the brand from the domain/tenant instead of a visible switch.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type BrandId = "urban" | "coast";

export interface Brand {
  id: BrandId;
  /** Full brand name shown in headers. */
  name: string;
  /** Short label for the switcher pill. */
  short: string;
  /** Primary accent (hex). Drives the `--brand` CSS variable. */
  accent: string;
  /** HSL triplet used for hero gradients (matches the accent hue). */
  heroAccent: string;
  /** Uppercase eyebrow shown above hero/section titles. */
  eyebrow: string;
  /** One-line positioning. */
  tagline: string;
  /** Who the brand is for (used in copy). */
  audience: string;
  /** Public-web hero copy. */
  heroTitle: string;
  heroSubtitle: string;
  /** Word used for a bookable unit. */
  unitWord: string;
  /** Seed `brand` tag the discovery filters on. */
  propertyBrand: BrandId;
}

export const BRANDS: Record<BrandId, Brand> = {
  urban: {
    id: "urban",
    name: "Hotel Lumen",
    short: "Lumen",
    accent: "#1F3A5F",
    heroAccent: "214 51% 25%",
    eyebrow: "Hotel Lumen · Boutique urbano",
    tagline: "Un hotel boutique en el centro histórico de Valencia",
    audience: "viajeros urbanos",
    heroTitle: "Duerme en el centro, vive la ciudad",
    heroSubtitle:
      "Habitaciones de diseño a un paseo de la catedral y el mercado, con rooftop, desayuno de producto local y atención 24 h.",
    unitWord: "habitación",
    propertyBrand: "urban",
  },
  coast: {
    id: "coast",
    name: "Albora Hotel & Spa",
    short: "Albora",
    accent: "#0F6E8C",
    heroAccent: "194 81% 30%",
    eyebrow: "Albora · Hotel de costa",
    tagline: "Frente al Mediterráneo, en la Costa Blanca",
    audience: "familias y parejas",
    heroTitle: "El mar a un paso de tu habitación",
    heroSubtitle:
      "Habitaciones con vistas al mar, spa, pádel y experiencias en la bahía de Altea. Reserva directa al mejor precio.",
    unitWord: "habitación",
    propertyBrand: "coast",
  },
};

const DEFAULT_BRAND: BrandId = "urban";
const KEY = "stays-brand";

interface BrandCtx {
  brand: Brand;
  brandId: BrandId;
  setBrand: (id: BrandId) => void;
}

const Ctx = createContext<BrandCtx | null>(null);

function readBrand(): BrandId {
  if (typeof window === "undefined") return DEFAULT_BRAND;
  const v = window.localStorage.getItem(KEY);
  return v === "urban" || v === "coast" ? v : DEFAULT_BRAND;
}

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brandId, setBrandIdState] = useState<BrandId>(readBrand);
  const brand = BRANDS[brandId];

  // Persist + expose the accent as a global CSS variable so every `var(--brand)`
  // utility (and toasts/portals outside the React tree) re-skins instantly.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEY, brandId);
    document.documentElement.style.setProperty("--brand", brand.accent);
  }, [brandId, brand.accent]);

  const value = useMemo<BrandCtx>(
    () => ({ brand, brandId, setBrand: setBrandIdState }),
    [brand, brandId],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBrand() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBrand must be used inside BrandProvider");
  return c;
}
