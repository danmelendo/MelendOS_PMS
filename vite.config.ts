import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig({
  // Absolute base: the app is a client-routed SPA served from the site root
  // (Netlify + _redirects). A relative base ("./") breaks hard-reloads/shared
  // links on nested routes like /web/hotel/$id, because the asset URLs then
  // resolve under the route path and the SPA fallback returns index.html for them.
  base: "/",
  plugins: [
    tailwindcss(),
    tsconfigPaths(),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
  ],
  // Preview from a phone or share for review through a Cloudflare quick tunnel
  // (`cloudflared tunnel --url http://localhost:5173`). Only *.trycloudflare.com
  // is accepted, not any host.
  server: { allowedHosts: [".trycloudflare.com"] },
});
