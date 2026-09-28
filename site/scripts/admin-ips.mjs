// The IPs the management panel opens from (sales_allowed_ips), without the
// panel: to get back in when your connection's IP changed. Direct database
// access (SALES_DB_URL in site/.env), so it needs no allowed IP itself.
// Usage (from site/):
//   node --env-file=.env scripts/admin-ips.mjs                 list
//   node --env-file=.env scripts/admin-ips.mjs add 83.45.120.7 "Casa"
//   node --env-file=.env scripts/admin-ips.mjs remove 83.45.120.7
//   node --env-file=.env scripts/admin-ips.mjs clear           no restriction
import pg from "pg";

const [action = "list", network, label] = process.argv.slice(2);
const db = new pg.Client({ connectionString: process.env.SALES_DB_URL });
await db.connect();
try {
  if (action === "add") {
    if (!network) throw new Error("Falta la IP o el rango (p. ej. 83.45.120.7 o 83.45.120.0/24)");
    await db.query(
      `insert into public.sales_allowed_ips (network, label) values ($1::cidr, $2)
       on conflict (network) do update set label = excluded.label`,
      [network, label ?? "Añadida por script"],
    );
  } else if (action === "remove") {
    if (!network) throw new Error("Falta la IP o el rango");
    const { rowCount } = await db.query(
      "delete from public.sales_allowed_ips where network = $1::cidr",
      [network],
    );
    if (!rowCount) console.log(`${network} no estaba en la lista.`);
  } else if (action === "clear") {
    await db.query("delete from public.sales_allowed_ips");
    console.log("Lista vacía: el panel se abre desde cualquier red.");
  } else if (action !== "list") {
    throw new Error(`Acción desconocida: ${action} (list, add, remove, clear)`);
  }
  const { rows } = await db.query(
    "select network::text, label, created_at from public.sales_allowed_ips order by created_at",
  );
  if (!rows.length) console.log("Sin restricción por IP.");
  for (const r of rows) console.log(`${r.network.padEnd(24)} ${r.label ?? ""}`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
