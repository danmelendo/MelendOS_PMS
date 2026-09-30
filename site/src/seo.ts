// Search metadata of every page: title, description, canonical path, what goes
// into the sitemap and the structured data (schema.org JSON-LD). Read at build
// time by the Vite plugin in vite.config.ts (head tags) and by
// scripts/prerender.mjs (sitemap.xml, robots.txt). Plain data: no React here.
import { COMPLIANCE_FAQ, PRICING_FAQ, type Faq } from "./content/faq";
import { PLAN_IDS, PLANS } from "../supabase/functions/_shared/plans.ts";

export const BRAND = "Melend/OS";

export interface PageSeo {
  /** The HTML file this entry describes (Vite input). */
  file: string;
  path: string;
  title: string;
  description: string;
  /** Kept out of search results and the sitemap. */
  noindex?: boolean;
  priority?: number;
  changefreq?: "weekly" | "monthly" | "yearly";
  faq?: Faq[];
  /** Adds the SoftwareApplication entry with the published prices. */
  product?: boolean;
}

export const SEO: PageSeo[] = [
  {
    file: "index.html",
    path: "/",
    title: "Melend/OS · PMS para hostales y hoteles independientes",
    description:
      "Programa de gestión hotelera en la nube para hostales y hoteles independientes: reservas, web sin comisiones, registro de viajeros e IA. Desde 39 €/mes, sin permanencia.",
    priority: 1,
    changefreq: "weekly",
    product: true,
  },
  {
    file: "hostales/index.html",
    path: "/hostales/",
    title: "Programa de gestión para hostales y pensiones · Melend/OS",
    description:
      "Deja el Excel y la libreta: calendario, reservas, web de reserva directa y registro de viajeros para tu hostal desde 39 €/mes. Sin permanencia ni comisiones.",
    priority: 0.9,
    changefreq: "monthly",
    product: true,
  },
  {
    file: "normativa/index.html",
    path: "/normativa/",
    title: "SES.HOSPEDAJES y VeriFactu para hoteles y hostales · Melend/OS",
    description:
      "Qué exigen el registro de viajeros en SES.HOSPEDAJES y la facturación VeriFactu, desde cuándo son obligatorios y cómo te ayuda Melend/OS a cumplir.",
    priority: 0.9,
    changefreq: "monthly",
    faq: COMPLIANCE_FAQ,
  },
  {
    file: "precios/index.html",
    path: "/precios/",
    title: "Precios del PMS para hoteles y hostales · Melend/OS",
    description:
      "Desde 3 € por habitación y mes. Planes Hostal, Esencial, Profesional y Grupo, SLA opcional según la urgencia, sin comisiones ni permanencia. Calcula tu precio.",
    priority: 0.9,
    changefreq: "monthly",
    faq: PRICING_FAQ,
    product: true,
  },
  {
    file: "demo/index.html",
    path: "/demo/",
    title: "Agenda una demo de Melend/OS",
    description:
      "Elige día y hora y te enseñamos Melend/OS en 30 minutos por videollamada, con las preguntas de tu hotel o hostal. Sin compromiso.",
    priority: 0.8,
    changefreq: "monthly",
  },
  {
    file: "privacidad/index.html",
    path: "/privacidad/",
    title: "Política de privacidad · Melend/OS",
    description: "Cómo tratamos los datos que nos envías desde esta web.",
    noindex: true,
  },
  {
    file: "admin/index.html",
    path: "/admin/",
    title: "Panel de gestión · Melend/OS",
    description: "Acceso del equipo de ventas.",
    noindex: true,
  },
  {
    file: "alta/index.html",
    path: "/alta/",
    title: "Alta en Melend/OS",
    description: "Formulario de alta de tu alojamiento.",
    noindex: true,
  },
  {
    file: "404.html",
    path: "/404",
    title: "Página no encontrada · Melend/OS",
    description: "La página que buscas no existe.",
    noindex: true,
  },
];

/** Base URL of the published site, without a trailing slash. */
export function siteUrl(env: Record<string, string | undefined>) {
  const url =
    env.VITE_SITE_URL ||
    (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    "http://localhost:5173";
  return url.replace(/\/+$/, "");
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function structuredData(page: PageSeo, base: string) {
  const graph: Record<string, unknown>[] = [
    {
      "@type": "Organization",
      "@id": `${base}/#org`,
      name: BRAND,
      url: `${base}/`,
      logo: `${base}/isologo-256.png`,
    },
  ];
  if (page.product) {
    const prices = PLAN_IDS.map((id) => PLANS[id].minimum);
    graph.push({
      "@type": "SoftwareApplication",
      name: BRAND,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Hotel property management system (PMS)",
      operatingSystem: "Web",
      inLanguage: "es",
      publisher: { "@id": `${base}/#org` },
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "EUR",
        lowPrice: Math.min(...prices),
        highPrice: Math.max(...prices),
        offerCount: PLAN_IDS.length,
        url: `${base}/precios/`,
      },
    });
  }
  if (page.faq?.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: page.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  // "<" escaped so the JSON can never close the script tag.
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(
    /</g,
    "\\u003c",
  );
}

/** Head tags for a page: title, description, canonical, social cards, JSON-LD. */
export function headTags(page: PageSeo, base: string) {
  const url = `${base}${page.path}`;
  const image = `${base}/og.jpg`;
  const tags = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    page.noindex
      ? `<meta name="robots" content="noindex, follow" />`
      : `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${BRAND}" />`,
    `<meta property="og:locale" content="es_ES" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<script type="application/ld+json">${structuredData(page, base)}</script>`,
  ];
  return tags.join("\n    ");
}

export function sitemap(base: string, lastmod: string) {
  const urls = SEO.filter((p) => !p.noindex)
    .map(
      (p) =>
        `  <url><loc>${base}${p.path}</loc><lastmod>${lastmod}</lastmod>` +
        `<changefreq>${p.changefreq ?? "monthly"}</changefreq><priority>${(p.priority ?? 0.5).toFixed(1)}</priority></url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robots(base: string) {
  return `User-agent: *\nAllow: /\nDisallow: /404\nDisallow: /admin/\n\nSitemap: ${base}/sitemap.xml\n`;
}
