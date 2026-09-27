// The hotel's web identity (tenants.brand) and where its booking web answers.
// Pure helpers shared by the brand layer (brand.tsx) and the panel.

/** The hotel's slug (stable, readable key). */
export type BrandId = string;

export interface Brand {
  id: BrandId;
  tenantId: string | null;
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
  logoUrl: string | null;
  heroImageUrl: string | null;
  gallery: string[];
  about: string;
  phone: string;
  email: string;
  address: string;
  instagram: string;
  facebook: string;
  /** The hotel's main website, if it has one besides this booking web. */
  websiteUrl: string | null;
}

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
  brand: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
}

/** "#1F3A5F" → "214 51% 25%" (the hero gradient's hue). */
export function hexToHsl(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "214 51% 25%";
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = Math.round(h * 60 < 0 ? h * 60 + 360 : h * 60);
  return `${h} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const text = (v: unknown, fallback = "") => (typeof v === "string" && v.trim() ? v : fallback);

/** A hotel's brand from its tenant row, with sensible defaults. */
export function brandOf(t: TenantRow): Brand {
  const b = t.brand ?? {};
  const accent = text(b.accent, "#1F3A5F");
  const site = t.settings?.website_url;
  return {
    id: t.slug,
    tenantId: t.id,
    name: t.name,
    short: text(b.short, t.name),
    accent,
    heroAccent: text(b.heroAccent, hexToHsl(accent)),
    eyebrow: text(b.eyebrow, t.name),
    tagline: text(b.tagline),
    audience: text(b.audience, "viajeros"),
    heroTitle: text(b.heroTitle, t.name),
    heroSubtitle: text(b.heroSubtitle),
    unitWord: text(b.unitWord, "habitación"),
    logoUrl: text(b.logo_url) || null,
    heroImageUrl: text(b.hero_image_url) || null,
    gallery: Array.isArray(b.gallery)
      ? b.gallery.filter((g): g is string => typeof g === "string")
      : [],
    about: text(b.about),
    phone: text(b.phone),
    email: text(b.email),
    address: text(b.address),
    instagram: text(b.instagram),
    facebook: text(b.facebook),
    websiteUrl: typeof site === "string" && /^https?:\/\//.test(site) ? site : null,
  };
}

const PLATFORM = (import.meta.env.VITE_PLATFORM_DOMAIN as string | undefined)?.toLowerCase() ?? "";

/** The URL where a hotel's booking web answers (its domain, or the platform subdomain). */
export function hotelWebUrl(t: { slug: string; domain: string | null }): string | null {
  if (t.domain) return `https://${t.domain}`;
  return PLATFORM ? `https://${t.slug}.${PLATFORM}` : null;
}

/** Which hotel this host name belongs to: a domain, a platform subdomain, or none (demo). */
export function hostHotel(
  host: string,
  platform = PLATFORM,
): { domain?: string; slug?: string } | null {
  const h = host.toLowerCase();
  if (h === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return null;
  if (platform && h.endsWith(`.${platform}`)) {
    const slug = h.slice(0, -platform.length - 1);
    return /^[a-z0-9-]{3,40}$/.test(slug) ? { slug } : null;
  }
  if (platform && h === platform) return null;
  // *.localhost in development behaves like a platform subdomain.
  if (h.endsWith(".localhost")) return { slug: h.slice(0, -".localhost".length) };
  return { domain: h };
}
