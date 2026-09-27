// After `vite build`: renders every page to HTML inside its #root (search
// engines and link previews get the full content without running JS; React
// hydrates it in the browser) and writes sitemap.xml and robots.txt.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createServer, loadEnv } from "vite";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");

// Which component renders each page (entry files mount the same ones).
const PAGES = {
  "index.html": ["/src/pages/Home.tsx", "HomePage"],
  "hostales/index.html": ["/src/pages/Hostels.tsx", "HostelsPage"],
  "normativa/index.html": ["/src/pages/Compliance.tsx", "CompliancePage"],
  "precios/index.html": ["/src/pages/Pricing.tsx", "PricingPage"],
  "demo/index.html": ["/src/pages/Demo.tsx", "DemoPage"],
  "privacidad/index.html": ["/src/pages/Privacy.tsx", "PrivacyPage"],
  "admin/index.html": ["/src/pages/Admin.tsx", "AdminPage"],
  "404.html": ["/src/pages/NotFound.tsx", "NotFoundPage"],
};

const vite = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});
try {
  const { SEO, siteUrl, sitemap, robots } = await vite.ssrLoadModule("/src/seo.ts");
  for (const page of SEO) {
    const entry = PAGES[page.file];
    if (!entry) throw new Error(`No component for ${page.file} in scripts/prerender.mjs`);
    const mod = await vite.ssrLoadModule(entry[0]);
    const body = renderToString(createElement(mod[entry[1]]));
    const file = resolve(dist, page.file);
    const html = readFileSync(file, "utf8");
    if (!html.includes('<div id="root"></div>')) throw new Error(`No empty #root in ${page.file}`);
    writeFileSync(file, html.replace('<div id="root"></div>', `<div id="root">${body}</div>`));
  }
  const env = { ...process.env, ...loadEnv("production", root, "") };
  const base = siteUrl(env);
  writeFileSync(resolve(dist, "sitemap.xml"), sitemap(base, new Date().toISOString().slice(0, 10)));
  writeFileSync(resolve(dist, "robots.txt"), robots(base));
  console.log(`Prerendered ${SEO.length} pages · sitemap and robots for ${base}`);
} finally {
  await vite.close();
}
