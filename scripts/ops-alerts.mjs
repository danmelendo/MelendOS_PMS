// Operations check across every hotel (ops_alerts): stuck or failing sending
// queues, the AI failing too often and, with SUPABASE_PUBLISHABLE_KEY, the
// public API and Edge Functions (smoke.mjs). Writes a Markdown report for the
// "Alertas de operación" issue (.github/workflows/ops-alerts.yml) and prints
// how many alerts there are. Also useful by hand.
// Usage: node --env-file=.env scripts/ops-alerts.mjs [--out report.md]
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { smoke } from "./smoke.mjs";

const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env;
const out = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : null;
const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const { data, error } = await db.rpc("ops_alerts");
if (error) {
  console.error(`ops_alerts: ${error.message}`);
  process.exit(1);
}
const rows = data ?? [];

// The public side as a guest's browser sees it (API, Edge Functions): a
// function that crashes or times out shows up here, not in the queues.
if (SUPABASE_PUBLISHABLE_KEY) {
  const failures = await smoke({ url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY });
  const now = new Date().toISOString();
  for (const f of failures)
    rows.push({
      hotel: "Plataforma",
      source: "API y funciones",
      problem: `${f.name}: ${f.message}`,
      items: 1,
      oldest: now,
    });
}
const when = (iso) =>
  new Date(iso).toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "short",
    timeStyle: "short",
  });

// Which alerts are active (not how many items or since when): the workflow
// only comments on the issue when this changes, not every hour.
const signature = createHash("sha256")
  .update(
    rows
      .map((r) => `${r.hotel}|${r.source}|${r.problem}`)
      .sort()
      .join("\n"),
  )
  .digest("hex")
  .slice(0, 16);

const report = rows.length
  ? [
      `**${rows.length} alerta(s)** en la comprobación del ${when(new Date().toISOString())} (hora de Madrid).`,
      "",
      "| Hotel | Qué | Problema | Elementos | Desde |",
      "| --- | --- | --- | --- | --- |",
      ...rows.map(
        (r) => `| ${r.hotel} | ${r.source} | ${r.problem} | ${r.items} | ${when(r.oldest)} |`,
      ),
      "",
      "Detalle en el panel del hotel: Admin → Actividad y consumo (últimos errores) y, según la cola, Registro de viajeros, Facturas o Canales.",
      "",
      `<!-- ops-alerts:${signature} -->`,
    ].join("\n")
  : "Sin alertas.";

if (out) writeFileSync(out, report);
console.log(report);
console.log(`alerts=${rows.length}`);
console.log(`signature=${signature}`);
