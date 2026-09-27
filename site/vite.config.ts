import { resolve } from "node:path";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { SEO, headTags, siteUrl } from "./src/seo";

// Static multi-page site: one HTML per page (good for SEO and any static
// host), each mounting its React page. After the build, scripts/prerender.mjs
// fills each page with its rendered HTML and writes sitemap.xml and robots.txt.

/** Puts each page's title, description, canonical, social cards and JSON-LD in its <head>. */
function seoHead(base: string): Plugin {
  return {
    name: "seo-head",
    transformIndexHtml(html, ctx) {
      const file = ctx.path.replace(/^\//, "");
      const page = SEO.find((p) => p.file === file);
      if (!page) throw new Error(`No SEO entry for ${file} (add it to src/seo.ts)`);
      return html.replace("<!--seo-->", headTags(page, base));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, import.meta.dirname, "") };
  return {
    plugins: [react(), tailwindcss(), seoHead(siteUrl(env))],
    build: {
      rollupOptions: {
        input: Object.fromEntries(
          SEO.map((p) => [
            p.file.replace(/\/?index\.html$|\.html$/, "") || "home",
            resolve(import.meta.dirname, p.file),
          ]),
        ),
      },
    },
    test: {
      environment: "node",
      include: ["supabase/functions/**/*.test.ts", "src/**/*.test.ts"],
    },
  };
});
