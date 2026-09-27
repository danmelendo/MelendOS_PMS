// Site-wide settings. The product name lives here only, so renaming it is a
// one-line change (plus the fixed copy in src/content and src/seo.ts).
export const BRAND = "Melend/OS";

export const SALES = {
  url: import.meta.env.VITE_SALES_SUPABASE_URL as string | undefined,
  key: import.meta.env.VITE_SALES_SUPABASE_KEY as string | undefined,
  email: (import.meta.env.VITE_SALES_EMAIL as string | undefined) ?? "",
};

export const PAGES = {
  home: "/",
  hostels: "/hostales/",
  compliance: "/normativa/",
  pricing: "/precios/",
  demo: "/demo/",
  privacy: "/privacidad/",
} as const;
