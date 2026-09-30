// Onboarding forms in the sales project: a random key the database uses to call
// the onboarding function (Vault onboarding/cron_url and onboarding/cron_key)
// and the function secret ONBOARDING_CRON_KEY. Run once from site/; running it
// again rotates the key.
//   node --env-file=.env scripts/onboarding-setup.mjs
// Needs VITE_SALES_SUPABASE_URL, SALES_DB_URL, SALES_PROJECT_REF and
// SUPABASE_ACCESS_TOKEN (the sales project's).
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";

const { VITE_SALES_SUPABASE_URL: base, SALES_DB_URL, SALES_PROJECT_REF } = process.env;
if (!base || !SALES_DB_URL || !SALES_PROJECT_REF) {
  console.error("Faltan VITE_SALES_SUPABASE_URL, SALES_DB_URL o SALES_PROJECT_REF");
  process.exit(1);
}

const key = randomBytes(32).toString("base64url");
const url = `${base}/functions/v1/onboarding`;

// Function secret first: until the database has the new key, calls carry the
// old one and fail harmlessly (the next tick retries).
execFileSync(
  "npx",
  ["supabase", "secrets", "set", `ONBOARDING_CRON_KEY=${key}`, "--project-ref", SALES_PROJECT_REF],
  { stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32" },
);
console.log("Secreto ONBOARDING_CRON_KEY puesto.");

const db = new pg.Client({ connectionString: SALES_DB_URL });
await db.connect();
try {
  for (const [name, value] of [
    ["onboarding/cron_url", url],
    ["onboarding/cron_key", key],
  ]) {
    const { rows } = await db.query("select id from vault.secrets where name = $1", [name]);
    if (rows.length) await db.query("select vault.update_secret($1, $2)", [rows[0].id, value]);
    else
      await db.query("select vault.create_secret($1, $2, 'Onboarding forms dispatch')", [
        value,
        name,
      ]);
  }
  console.log(`Vault: onboarding/cron_url = ${url}, onboarding/cron_key puesta.`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
