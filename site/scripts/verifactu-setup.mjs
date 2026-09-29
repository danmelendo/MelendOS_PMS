// VERI*FACTU in the sales project (Melend/OS's own invoices). Run from site/:
//   node --env-file=.env scripts/verifactu-setup.mjs
//     scheduled sending: a random key the database uses to call
//     verifactu-dispatch (Vault verifactu/cron_url and verifactu/cron_key) and
//     the function secret VERIFACTU_CRON_KEY. Running it again rotates the key.
//   node --env-file=.env scripts/verifactu-setup.mjs --cert cert.pem --key key.pem
//     also stores the issuer's qualified certificate (PEM) in Vault. From a .p12:
//     openssl pkcs12 -in cert.p12 -clcerts -nokeys > cert.pem
//     openssl pkcs12 -in cert.p12 -nocerts -nodes > key.pem   (then delete key.pem)
// Needs VITE_SALES_SUPABASE_URL, SALES_DB_URL, SALES_PROJECT_REF and
// SUPABASE_ACCESS_TOKEN (the sales project's).
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";

const { VITE_SALES_SUPABASE_URL: base, SALES_DB_URL, SALES_PROJECT_REF } = process.env;
if (!base || !SALES_DB_URL || !SALES_PROJECT_REF) {
  console.error("Faltan VITE_SALES_SUPABASE_URL, SALES_DB_URL o SALES_PROJECT_REF");
  process.exit(1);
}
const arg = (name) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;

const key = randomBytes(32).toString("base64url");
const url = `${base}/functions/v1/verifactu-dispatch`;

// Function secret first: until the database has the new key, calls carry the
// old one and fail harmlessly (the next tick retries).
execFileSync(
  "npx",
  ["supabase", "secrets", "set", `VERIFACTU_CRON_KEY=${key}`, "--project-ref", SALES_PROJECT_REF],
  { stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32" },
);
console.log("Secreto VERIFACTU_CRON_KEY puesto.");

const db = new pg.Client({ connectionString: SALES_DB_URL });
await db.connect();
try {
  for (const [name, value] of [
    ["verifactu/cron_url", url],
    ["verifactu/cron_key", key],
  ]) {
    const { rows } = await db.query("select id from vault.secrets where name = $1", [name]);
    if (rows.length) await db.query("select vault.update_secret($1, $2)", [rows[0].id, value]);
    else
      await db.query("select vault.create_secret($1, $2, 'VERI*FACTU scheduled dispatch')", [
        value,
        name,
      ]);
  }
  console.log(`Vault: verifactu/cron_url = ${url}, verifactu/cron_key puesta.`);

  const certFile = arg("--cert");
  const keyFile = arg("--key");
  if (certFile || keyFile) {
    if (!certFile || !keyFile) throw new Error("Hacen falta --cert y --key");
    await db.query("select public.save_sales_verifactu_certificate($1, $2)", [
      readFileSync(certFile, "utf8"),
      readFileSync(keyFile, "utf8"),
    ]);
    console.log("Certificado guardado en Vault (verifactu/melendos).");
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
