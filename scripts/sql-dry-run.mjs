// Runs SQL files against SUPABASE_DB_URL inside a transaction and always rolls
// back: validates migrations and seeds without leaving anything applied.
// Usage: node --env-file=.env scripts/sql-dry-run.mjs <file.sql> [more.sql…]
import { readFileSync } from "node:fs";
import pg from "pg";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: node --env-file=.env scripts/sql-dry-run.mjs <file.sql> [...]");
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await client.connect();
try {
  await client.query("begin");
  for (const f of files) {
    await client.query(readFileSync(f, "utf8"));
    console.log(`OK  ${f}`);
  }
} catch (e) {
  console.error(`ERROR: ${e.message}`);
  if (e.position) console.error(`  at character ${e.position}`);
  if (e.where) console.error(`  where: ${e.where}`);
  process.exitCode = 1;
} finally {
  await client.query("rollback");
  await client.end();
  console.log("Rolled back: nothing was applied.");
}
