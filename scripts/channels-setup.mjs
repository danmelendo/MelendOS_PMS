// Sets up the scheduled sending of availability to the channels (OTAs) in
// a Supabase project: a random key the database uses to call channels-dispatch,
// kept in Vault (channels/cron_url, channels/cron_key) and as the function secret
// CHANNELS_CRON_KEY. Run once per project (demo, production); running it again
// rotates the key.
// Usage: set -a; . ./.env; set +a; node scripts/channels-setup.mjs
// (SUPABASE_URL, SUPABASE_DB_URL, SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN)
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";

const { SUPABASE_URL, SUPABASE_DB_URL, SUPABASE_PROJECT_REF } = process.env;
if (!SUPABASE_URL || !SUPABASE_DB_URL || !SUPABASE_PROJECT_REF) {
  console.error("Missing SUPABASE_URL, SUPABASE_DB_URL or SUPABASE_PROJECT_REF");
  process.exit(1);
}
const key = randomBytes(32).toString("base64url");
const url = `${SUPABASE_URL}/functions/v1/channels-dispatch`;

// Function secret first: until the database has the new key, calls still
// carry the old one and fail harmlessly (the next tick retries).
execFileSync(
  "npx",
  ["supabase", "secrets", "set", `CHANNELS_CRON_KEY=${key}`, "--project-ref", SUPABASE_PROJECT_REF],
  { stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32" },
);
console.log("Function secret CHANNELS_CRON_KEY set.");

const client = new pg.Client({ connectionString: SUPABASE_DB_URL });
await client.connect();
try {
  for (const [name, value] of [
    ["channels/cron_url", url],
    ["channels/cron_key", key],
  ]) {
    const { rows } = await client.query("select id from vault.secrets where name = $1", [name]);
    if (rows.length) await client.query("select vault.update_secret($1, $2)", [rows[0].id, value]);
    else
      await client.query("select vault.create_secret($1, $2, 'Channels scheduled dispatch')", [
        value,
        name,
      ]);
  }
  console.log(`Vault: channels/cron_url = ${url}, channels/cron_key set.`);
} finally {
  await client.end();
}
