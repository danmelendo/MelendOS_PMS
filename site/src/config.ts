// Site-wide settings. The product name lives here only, so renaming it is a
// one-line change.
export const BRAND = "Demo Stays";

export const SALES = {
  url: import.meta.env.VITE_SALES_SUPABASE_URL as string | undefined,
  key: import.meta.env.VITE_SALES_SUPABASE_KEY as string | undefined,
  email: (import.meta.env.VITE_SALES_EMAIL as string | undefined) ?? "",
};

export const PAGES = {
  home: "/",
  pricing: "/precios/",
  demo: "/demo/",
  privacy: "/privacidad/",
} as const;
