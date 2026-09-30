// Scheduled dispatch for a self-hosted installation (VPS): the self-hosted
// version of scripts/{ses,verifactu,emails,channels}-setup.mjs.
//
// For each queue it generates a random key, stores it in Vault with the
// function URL (internal: the database calls the gateway on the installation's
// own network, never through the internet) and prints the function secret as
// NAME=value lines, meant to be appended to the installation's functions.env.
// Running it again rotates the keys (restart the functions container after).
//
// Usage: node deploy/vps/tools/cron-setup.mjs <db-url> [functions-base-url]
//   default functions-base-url: http://api-gw:8000/functions/v1
import { randomBytes } from "node:crypto";
import pg from "pg";

const [dbUrl, base = "http://api-gw:8000/functions/v1"] = process.argv.slice(2);
if (!dbUrl) {
  console.error("Usage: cron-setup.mjs <db-url> [functions-base-url]");
  process.exit(1);
}

const QUEUES = [
  { vault: "ses", fn: "ses-dispatch", secret: "SES_CRON_KEY", note: "SES scheduled dispatch" },
  {
    vault: "verifactu",
    fn: "verifactu-dispatch",
    secret: "VERIFACTU_CRON_KEY",
    note: "VERI*FACTU scheduled dispatch",
  },
  {
    vault: "guest-emails",
    fn: "guest-emails-dispatch",
    secret: "GUEST_EMAILS_CRON_KEY",
    note: "Guest emails scheduled dispatch",
  },
  {
    vault: "channels",
    fn: "channels-dispatch",
    secret: "CHANNELS_CRON_KEY",
    note: "Channels scheduled dispatch",
  },
];

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
const lines = [];
try {
  for (const q of QUEUES) {
    const key = randomBytes(32).toString("base64url");
    for (const [name, value] of [
      [`${q.vault}/cron_url`, `${base}/${q.fn}`],
      [`${q.vault}/cron_key`, key],
    ]) {
      const { rows } = await client.query("select id from vault.secrets where name = $1", [name]);
      if (rows.length)
        await client.query("select vault.update_secret($1, $2)", [rows[0].id, value]);
      else await client.query("select vault.create_secret($1, $2, $3)", [value, name, q.note]);
    }
    lines.push(`${q.secret}=${key}`);
    console.error(`Vault: ${q.vault}/cron_url = ${base}/${q.fn}, ${q.vault}/cron_key set.`);
  }
} finally {
  await client.end();
}
process.stdout.write(lines.join("\n") + "\n");
