// The trusted devices of the management panel (sales_devices), without the
// panel: to get back in when no approved device is at hand (lost laptop,
// cleared browser) or the phone with the authenticator app is gone. Direct
// database access (SALES_DB_URL in site/.env).
// Usage (from site/):
//   node --env-file=.env scripts/admin-devices.mjs                    list
//   node --env-file=.env scripts/admin-devices.mjs approve <id>       approve a pending device
//   node --env-file=.env scripts/admin-devices.mjs revoke <id>        revoke it and cut its sessions
//   node --env-file=.env scripts/admin-devices.mjs reset-mfa <email>  remove the account's
//                                  authenticator app (the panel asks to set it up again)
// <id> may be the first characters of the id, as `list` prints them.
import pg from "pg";

const [action = "list", arg] = process.argv.slice(2);
const db = new pg.Client({ connectionString: process.env.SALES_DB_URL });
await db.connect();

/** The one device whose id starts with `prefix`. */
async function device(prefix) {
  if (!prefix) throw new Error("Falta el id del equipo (lo da `list`)");
  const { rows } = await db.query(
    "select id, name from public.sales_devices where id::text like $1 || '%'",
    [prefix.toLowerCase()],
  );
  if (rows.length !== 1)
    throw new Error(rows.length ? `Varios equipos empiezan por ${prefix}` : `No hay equipo ${prefix}`);
  return rows[0];
}

try {
  if (action === "approve") {
    const d = await device(arg);
    const { rowCount } = await db.query(
      `update public.sales_devices set approved_at = now(), approved_via = 'script', approved_by = null
        where id = $1 and approved_at is null and revoked_at is null`,
      [d.id],
    );
    console.log(rowCount ? `Aprobado: ${d.name}` : `${d.name} ya estaba aprobado o revocado.`);
  } else if (action === "revoke") {
    const d = await device(arg);
    await db.query("begin");
    await db.query(
      "update public.sales_devices set revoked_at = now() where id = $1 and revoked_at is null",
      [d.id],
    );
    await db.query("delete from public.sales_device_sessions where device_id = $1", [d.id]);
    await db.query("commit");
    console.log(`Revocado: ${d.name}`);
  } else if (action === "reset-mfa") {
    if (!arg) throw new Error("Falta el email de la cuenta");
    const { rowCount } = await db.query(
      `delete from auth.mfa_factors
        where factor_type = 'totp' and user_id = (select id from auth.users where email = $1)`,
      [arg.toLowerCase()],
    );
    console.log(
      rowCount
        ? `Quitada la app de autenticación de ${arg}: el panel pedirá configurarla otra vez.`
        : `${arg} no tenía app de autenticación (¿email correcto?).`,
    );
  } else if (action !== "list") {
    throw new Error(`Acción desconocida: ${action} (list, approve, revoke, reset-mfa)`);
  }

  const { rows } = await db.query(
    `select d.id, u.email, d.name, d.created_at, d.approved_at, d.approved_via, d.last_seen_at,
            d.revoked_at
       from public.sales_devices d join auth.users u on u.id = d.user_id
      order by d.revoked_at is not null, d.approved_at is null desc, d.last_seen_at desc nulls last`,
  );
  if (!rows.length) console.log("Sin equipos registrados.");
  const day = (t) => (t ? t.toISOString().slice(0, 16).replace("T", " ") : "—");
  for (const r of rows) {
    const state = r.revoked_at
      ? "revocado"
      : r.approved_at
        ? `de confianza (${r.approved_via})`
        : "PENDIENTE";
    console.log(
      `${r.id.slice(0, 8)}  ${state.padEnd(24)} ${r.name.padEnd(22)} ${r.email}  último uso ${day(r.last_seen_at)}`,
    );
  }
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
