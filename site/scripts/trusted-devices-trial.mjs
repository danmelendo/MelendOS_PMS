// Tries the trusted-devices migration (and its functions) inside a transaction
// that is always rolled back: nothing stays in the database. Simulates the
// Supabase JWT with request.jwt.claims (sub, session_id, aal), the way
// PostgREST does, and the device-session function with direct inserts.
// Usage (from site/):
//   node --env-file=.env scripts/trusted-devices-trial.mjs
//   (SALES_DB_URL; the migration must not be applied yet)
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";

const MIGRATION = new URL(
  "../supabase/migrations/20260929160000_trusted_devices.sql",
  import.meta.url,
);
const KEY = { kty: "EC", crv: "P-256", x: "x-coordinate", y: "y-coordinate" };

const db = new pg.Client({ connectionString: process.env.SALES_DB_URL });
await db.connect();

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) failed++;
};

// Runs `sql` as a signed-in user (or anonymously with claims = null) and
// returns the rows, or the error message, without breaking the transaction.
async function as(claims, sql, params = []) {
  await db.query("savepoint step");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      claims ? JSON.stringify({ role: "authenticated", ...claims }) : "",
    ]);
    await db.query(`set local role ${claims ? "authenticated" : "anon"}`);
    const { rows } = await db.query(sql, params);
    await db.query("reset role");
    await db.query("release savepoint step");
    return { rows };
  } catch (e) {
    await db.query("rollback to savepoint step");
    await db.query("reset role");
    return { error: e.message };
  }
}

try {
  await db.query("begin");
  await db.query(readFileSync(MIGRATION, "utf8"));

  const admin = randomUUID();
  const other = randomUUID();
  for (const [id, email] of [
    [admin, "trial-admin@example.invalid"],
    [other, "trial-other@example.invalid"],
  ]) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  }
  await db.query("insert into public.sales_admins (user_id, email) values ($1, $2)", [
    admin,
    "trial-admin@example.invalid",
  ]);
  const s1 = randomUUID(); // session on the first device
  const s2 = randomUUID(); // session on the second device
  const me = (session, aal = "aal1") => ({ sub: admin, session_id: session, aal });
  // What device-session does (service role) for an approved device.
  const trust = (session, device, hours = 12) =>
    db.query(
      `insert into public.sales_device_sessions (session_id, device_id, user_id, expires_at)
       values ($1, $2, $3, now() + make_interval(hours => $4))
       on conflict (session_id) do update set device_id = excluded.device_id, expires_at = excluded.expires_at`,
      [session, device, admin, hours],
    );
  const leads = async (claims) => {
    const r = await as(claims, "select count(*)::int as n from public.leads");
    return r.error ?? r.rows[0].n;
  };
  await db.query(
    `insert into public.leads (kind, name, email, company, privacy_ok)
     values ('contact', 'Lead de prueba', 'lead@example.invalid', 'Hotel de prueba', true)`,
  );
  // Every lead in the table, as seen without RLS (the real base has more).
  const all = (await db.query("select count(*)::int as n from public.leads")).rows[0].n;

  // ── Registration ──────────────────────────────────────────────────────────
  const reg = (claims, key) =>
    as(claims, "select public.register_sales_device('Portátil', $1::jsonb) as id", [
      JSON.stringify(key),
    ]);
  const r1 = await reg(me(s1), KEY);
  check("a panel account registers a device", !!r1.rows?.[0]?.id, r1.error);
  const d1 = r1.rows?.[0]?.id;
  check(
    "a key with its private half (d) is refused",
    !!(await reg(me(s1), { ...KEY, d: "secret" })).error,
  );
  check("another curve is refused", !!(await reg(me(s1), { ...KEY, crv: "P-384" })).error);
  check(
    "an account outside sales_admins cannot register",
    !!(await reg({ sub: other, session_id: randomUUID() }, KEY)).error,
  );
  check("anonymous cannot register", !!(await reg(null, KEY)).error);
  const stored = await db.query("select public_key from public.sales_devices where id = $1", [d1]);
  check(
    "only kty, crv, x and y are stored",
    JSON.stringify(Object.keys(stored.rows[0].public_key).sort()) ===
      JSON.stringify(["crv", "kty", "x", "y"]),
  );

  // ── A pending device gives no access ──────────────────────────────────────
  await trust(s1, d1); // even with a session row, the device is not approved
  check("password only: no leads", (await leads(me(s1))) === 0);
  check(
    "a pending device is not trusted",
    (await as(me(s1), "select public.sales_session_trusted() as t")).rows?.[0]?.t === false,
  );
  check(
    "is_sales_account says yes (for the panel's messages)",
    (await as(me(s1), "select public.is_sales_account() as a")).rows?.[0]?.a === true,
  );

  // ── Approval with the authenticator app ───────────────────────────────────
  const mfa = (claims, id) =>
    as(claims, "select public.approve_sales_device_with_mfa($1)", [id]);
  check("approval at aal1 is refused", !!(await mfa(me(s1), d1)).error);
  const ok2 = await mfa(me(s1, "aal2"), d1);
  check("approval at aal2 works", !ok2.error, ok2.error);
  check("approved device + trusted session: sees the leads", (await leads(me(s1))) === all);
  check(
    "the same device cannot be approved twice",
    !!(await mfa(me(s1, "aal2"), d1)).error,
  );

  // ── Approval from a trusted device ────────────────────────────────────────
  const d2 = (await reg(me(s2), KEY)).rows?.[0]?.id;
  check("second device, not approved: no leads", (await leads(me(s2))) === 0);
  check(
    "an untrusted session cannot approve devices",
    !!(await as(me(s2), "select public.approve_sales_device($1)", [d2])).error,
  );
  const byDevice = await as(me(s1), "select public.approve_sales_device($1)", [d2]);
  check("a trusted session approves another device", !byDevice.error, byDevice.error);
  await trust(s2, d2);
  check("the second device now sees the leads", (await leads(me(s2))) === all);
  const list = await as(me(s1), "select id, is_current from public.list_sales_devices()");
  check(
    "list_sales_devices marks this device",
    list.rows?.length === 2 && list.rows.find((r) => r.id === d1)?.is_current === true,
    list.error,
  );
  check(
    "an untrusted session lists nothing",
    (await as(me(randomUUID()), "select * from public.list_sales_devices()")).rows?.length === 0,
  );

  // ── Revoking ──────────────────────────────────────────────────────────────
  const rev = await as(me(s1), "select public.revoke_sales_device($1)", [d2]);
  check("revoke works from a trusted session", !rev.error, rev.error);
  check("a revoked device loses access at once", (await leads(me(s2))) === 0);
  const left = await db.query(
    "select count(*)::int as n from public.sales_device_sessions where device_id = $1",
    [d2],
  );
  check("its sessions are deleted", left.rows[0].n === 0);
  await trust(s2, d2); // even if the function wrote one again
  check("a revoked device never counts", (await leads(me(s2))) === 0);

  // ── Expiry, other users, direct access to the tables ─────────────────────
  await trust(s1, d1, -1);
  check("an expired session is not trusted", (await leads(me(s1))) === 0);
  await trust(s1, d1);
  check(
    "another user with this session id gets nothing",
    (await leads({ sub: other, session_id: s1 })) === 0,
  );
  const anon = await leads(null);
  check("anonymous sees no leads", anon === 0 || /permission denied/.test(String(anon)), String(anon));
  check(
    "sales_devices is closed to the API",
    !!(await as(me(s1), "select * from public.sales_devices")).error,
  );
  check(
    "sales_device_sessions is closed to the API",
    !!(await as(me(s1), "insert into public.sales_device_sessions values ($1, $2, $3, now(), now() + interval '1 day')", [
      randomUUID(),
      d1,
      admin,
    ])).error,
  );
  check(
    "the IP allowlist is gone",
    (await db.query("select to_regclass('public.sales_allowed_ips') as t")).rows[0].t === null,
  );

  // ── The invoice cron (no auth.uid()) still works ─────────────────────────
  await db.query("select set_config('request.jwt.claims', '', true)");
  try {
    await db.query("savepoint cron");
    await db.query("select public.generate_client_invoices()");
    await db.query("release savepoint cron");
    check("generate_client_invoices() runs without a user", true);
  } catch (e) {
    await db.query("rollback to savepoint cron");
    check("generate_client_invoices() runs without a user", false, e.message);
  }
} catch (e) {
  console.error(e.message);
  failed++;
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
console.log(failed ? `\n${failed} failed (rolled back)` : "\nAll passed (rolled back)");
process.exitCode = failed ? 1 : 0;
