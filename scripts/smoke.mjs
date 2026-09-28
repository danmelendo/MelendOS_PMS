// Read-only smoke test of a deployed backend, with the public key only: what
// a guest's browser touches first. Writes nothing. Used after promoting to
// production (promote.yml), every hour by ops-alerts.mjs, and by hand.
// Usage: node --env-file=.env scripts/smoke.mjs [--hotel <slug>] [--production]
//   --production also requires the demo sign-in to be switched off.
// Needs SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.
import { pathToFileURL } from "node:url";

/** Runs every check; returns the failed ones as { name, message }. */
export async function smoke({ url, key, slug = null, production = false, log = () => {} }) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const failures = [];
  async function step(name, fn) {
    const t = Date.now();
    try {
      const detail = await fn();
      log(`  ✓ ${name} (${Date.now() - t} ms)${detail ? ` · ${detail}` : ""}`);
    } catch (e) {
      failures.push({ name, message: e.message });
      log(`  ✗ ${name}: ${e.message}`);
    }
  }
  async function call(path, init = {}) {
    const res = await fetch(`${url}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status, body, text };
  }

  let tenant = null;

  await step("La API responde y lista hoteles", async () => {
    const q = slug ? `&slug=eq.${encodeURIComponent(slug)}` : "";
    const r = await call(
      `/rest/v1/tenants?select=id,slug,name&status=in.(trial,active)${q}&limit=1`,
    );
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    tenant = r.body?.[0];
    if (!tenant) throw new Error(slug ? `no hay hotel activo «${slug}»` : "no hay hoteles activos");
    return tenant.name;
  });

  await step("Calendario de precios (Edge Function)", async () => {
    if (!tenant) throw new Error("sin hotel");
    const from = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const r = await call("/functions/v1/price-calendar", {
      method: "POST",
      body: JSON.stringify({ tenant_id: tenant.id, from, days: 7, guests: 2 }),
    });
    if (r.status !== 200) throw new Error(`HTTP ${r.status} ${r.text.slice(0, 120)}`);
    const days = r.body?.nights;
    if (!Array.isArray(days) || !days.length) throw new Error("respuesta sin noches");
    return `${days.length} noches`;
  });

  await step("Ofertas públicas del hotel (RPC)", async () => {
    if (!tenant) throw new Error("sin hotel");
    const r = await call("/rest/v1/rpc/hotel_offers", {
      method: "POST",
      body: JSON.stringify({ p_tenant: tenant.id }),
    });
    if (r.status !== 200) throw new Error(`HTTP ${r.status} ${r.text.slice(0, 120)}`);
  });

  await step("El motor de reservas rechaza una petición vacía sin romperse", async () => {
    const r = await call("/functions/v1/bookings-create", { method: "POST", body: "{}" });
    if (r.status >= 500) throw new Error(`HTTP ${r.status}: la función falla`);
    if (r.status < 400) throw new Error(`HTTP ${r.status}: aceptó una reserva vacía`);
    return `HTTP ${r.status}`;
  });

  await step("Datos privados cerrados al público", async () => {
    const r = await call("/rest/v1/reservations?select=id&limit=1");
    if (r.status === 200 && Array.isArray(r.body) && r.body.length)
      throw new Error("se leen reservas sin sesión");
  });

  if (production)
    await step("Acceso de demostración apagado", async () => {
      const r = await call("/functions/v1/demo-login", { method: "POST", body: "{}" });
      if (r.status !== 404)
        throw new Error(`HTTP ${r.status}: demo-login responde (quita DEMO_ACCESS)`);
    });
  return failures;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key } = process.env;
  if (!url || !key) {
    console.error("Faltan SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY.");
    process.exit(2);
  }
  const arg = (name) =>
    process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
  console.log(`Smoke ${url}`);
  const failures = await smoke({
    url,
    key,
    slug: arg("--hotel"),
    production: process.argv.includes("--production"),
    log: console.log,
  });
  console.log(
    failures.length ? `\n${failures.length} comprobaciones fallidas.` : "\nTodo en orden.",
  );
  process.exit(failures.length ? 1 : 0);
}
