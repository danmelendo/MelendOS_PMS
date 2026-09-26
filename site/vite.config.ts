import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Static multi-page site: one HTML per page (good for SEO and any static
// host), each mounting its React page.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, "index.html"),
        pricing: resolve(import.meta.dirname, "precios/index.html"),
        demo: resolve(import.meta.dirname, "demo/index.html"),
        privacy: resolve(import.meta.dirname, "privacidad/index.html"),
      },
    },
  },
  test: {
    environment: "node",
    include: ["supabase/functions/**/*.test.ts", "src/**/*.test.ts"],
  },
});
