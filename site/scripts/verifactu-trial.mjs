// Tries the VERI*FACTU migration of the sales project (and its functions)
// inside a transaction that is always rolled back: nothing stays. Simulates a
// trusted session of a panel admin (sales_devices + sales_device_sessions and
// request.jwt.claims), like the device-session function would leave it.
// Usage (from site/): node --env-file=.env scripts/verifactu-trial.mjs
// (SALES_DB_URL; the migration must not be applied yet)
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";

const MIGRATION = new URL("../supabase/migrations/20260929170000_verifactu.sql", import.meta.url);
const db = new pg.Client({ connectionString: process.env.SALES_DB_URL });
await db.connect();

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) failed++;
};
let claims = null;
// Runs `sql` as the trusted admin; returns rows or the error message.
async function run(sql, params = []) {
  await db.query("savepoint step");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await db.query("set local role authenticated");
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
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];

try {
  await db.query("begin");
  await db.query(readFileSync(MIGRATION, "utf8"));
  check("migration applies", true);

  // The AEAT's own example (huella v0.1.2, case 1) in SQL.
  const aeat = await one(
    `select public.verifactu_hash(
       array['IDEmisorFactura','NumSerieFactura','FechaExpedicionFactura','TipoFactura','CuotaTotal','ImporteTotal','Huella','FechaHoraHusoGenRegistro'],
       array['89890001K','12345678/G33','01-01-2024','F1','12.35','123.45','','2024-01-01T19:20:30+01:00']) h`,
  );
  check(
    "SQL fingerprint = AEAT example",
    aeat.h === "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60",
    aeat.h,
  );

  // A trusted session of a panel admin.
  const admin = (await one("select user_id from public.sales_admins limit 1")).user_id;
  const session = randomUUID();
  const device = (
    await one(
      `insert into public.sales_devices (user_id, name, public_key, approved_at, approved_via)
       values ($1, 'Prueba', '{"kty":"EC","crv":"P-256","x":"x","y":"y"}', now(), 'script') returning id`,
      [admin],
    )
  ).id;
  await db.query(
    `insert into public.sales_device_sessions (session_id, device_id, user_id, expires_at)
     values ($1, $2, $3, now() + interval '1 hour')`,
    [session, device, admin],
  );
  claims = { sub: admin, role: "authenticated", session_id: session, aal: "aal1" };

  const client = (
    await one(
      `insert into public.clients (name, legal_name, tax_id, plan, monthly_fee, status)
       values ('Hostal Prueba', 'Hostal Prueba SL', 'b-12345674', 'hostal', 39, 'active') returning id`,
    )
  ).id;
  const draft = async (base = 100) =>
    (
      await one(
        `insert into public.client_invoices (client_id, kind, concept, base, vat_rate)
         values ($1, 'other', 'Prueba VERI*FACTU', $2, 21) returning id`,
        [client, base],
      )
    ).id;
  const issue = (id) => run("select public.issue_client_invoice($1) n", [id]);
  const records = (id) =>
    db.query("select * from public.sales_verifactu_records where invoice_id = $1 order by seq", [
      id,
    ]);

  // ── Off (default): as before ─────────────────────────────────────────────
  const off = await issue(await draft());
  check(
    "off: issues as before",
    /^MOS-\d{4}-\d{4}$/.test(off.rows?.[0]?.n ?? ""),
    off.error ?? off.rows?.[0]?.n,
  );
  const offCount = (await one("select count(*)::int n from public.sales_verifactu_records")).n;
  check("off: no billing record", offCount === 0);

  // ── Simulated ────────────────────────────────────────────────────────────
  await db.query(
    "update public.sales_settings set verifactu_environment = 'simulated', issuer_name = null, issuer_tax_id = null",
  );
  const noIssuer = await issue(await draft());
  check(
    "simulated without issuer NIF: refused",
    /emisor/.test(noIssuer.error ?? ""),
    noIssuer.error,
  );
  await db.query(
    "update public.sales_settings set issuer_name = 'Melend/OS pruebas', issuer_tax_id = '12345678-Z'",
  );

  const i1 = await draft(100);
  const n1 = await issue(i1);
  check(
    "simulated: test series PMOS",
    /^PMOS-\d{4}-0001$/.test(n1.rows?.[0]?.n ?? ""),
    n1.error ?? n1.rows?.[0]?.n,
  );
  const r1 = (await records(i1)).rows;
  check(
    "one alta record, first of its chain",
    r1.length === 1 &&
      r1[0].kind === "alta" &&
      r1[0].prev_hash === null &&
      /^[0-9A-F]{64}$/.test(r1[0].hash),
  );
  check(
    "record texts: NIF normalized, F1, amounts",
    r1[0]?.issuer_nif === "12345678Z" &&
      r1[0]?.invoice_type === "F1" &&
      r1[0]?.cuota_total === "21.00" &&
      r1[0]?.importe_total === "121.00",
    JSON.stringify({
      nif: r1[0]?.issuer_nif,
      cuota: r1[0]?.cuota_total,
      total: r1[0]?.importe_total,
    }),
  );
  const recomputed = await one(
    `select public.verifactu_hash(
       array['IDEmisorFactura','NumSerieFactura','FechaExpedicionFactura','TipoFactura','CuotaTotal','ImporteTotal','Huella','FechaHoraHusoGenRegistro'],
       array[issuer_nif, invoice_number, issue_date, invoice_type, cuota_total, importe_total, prev_hash, generated_at]) = hash ok
     from public.sales_verifactu_records where id = $1`,
    [r1[0]?.id],
  );
  check("stored hash matches its own texts", recomputed?.ok === true);
  const inv1 = await one(
    "select recipient, verifactu_env from public.client_invoices where id = $1",
    [i1],
  );
  check(
    "recipient NIF normalized and env kept",
    inv1.recipient.tax_id === "B12345674" && inv1.verifactu_env === "simulated",
  );

  const i2 = await draft(50);
  await issue(i2);
  const r2 = (await records(i2)).rows[0];
  check("second record chains to the first", r2?.prev_hash === r1[0]?.hash && r2?.seq > r1[0]?.seq);

  const cancel = await run("update public.client_invoices set status = 'cancelled' where id = $1", [
    i2,
  ]);
  const r2all = (await records(i2)).rows;
  check(
    "cancelling adds an anulación chained to the last record",
    !cancel.error &&
      r2all.length === 2 &&
      r2all[1].kind === "anulacion" &&
      r2all[1].prev_hash === r2.hash,
    cancel.error,
  );

  const tamper = await run(
    "update public.sales_verifactu_records set hash = repeat('A', 64) where id = $1",
    [r1[0]?.id],
  );
  check("records cannot be changed", !!tamper.error);
  const del = await (async () => {
    await db.query("savepoint d");
    try {
      await db.query("delete from public.sales_verifactu_records where id = $1", [r1[0]?.id]);
      await db.query("release savepoint d");
      return false;
    } catch {
      await db.query("rollback to savepoint d");
      return true;
    }
  })();
  check("records cannot be deleted, not even by the owner", del);
  const nif = await run("update public.sales_settings set issuer_tax_id = '87654321X'");
  check("issuer NIF locked once there are records", !!nif.error, nif.error);

  const noClientNif = await (async () => {
    const c2 = (
      await one(
        "insert into public.clients (name, plan, status) values ('Sin NIF', 'hostal', 'active') returning id",
      )
    ).id;
    const d = (
      await one(
        "insert into public.client_invoices (client_id, kind, concept, base) values ($1, 'other', 'x', 10) returning id",
        [c2],
      )
    ).id;
    return issue(d);
  })();
  check(
    "a client without NIF cannot get a VERI*FACTU invoice",
    /cliente/.test(noClientNif.error ?? ""),
    noClientNif.error,
  );

  // ── Production chain is separate and locks the environment ─────────────
  await db.query("update public.sales_settings set verifactu_environment = 'prod'");
  const i3 = await draft(10);
  const n3 = await issue(i3);
  const r3 = (await records(i3)).rows[0];
  check(
    "prod: real series and a new chain",
    /^MOS-/.test(n3.rows?.[0]?.n ?? "") && r3?.prev_hash === null && r3?.environment === "prod",
    n3.error,
  );
  const back = await run("update public.sales_settings set verifactu_environment = 'simulated'");
  check("with production records the environment cannot change", !!back.error, back.error);

  const qr = await one(
    "select public.verifactu_qr_url('prod', '12345678Z', 'MOS-2026-0003', date '2026-09-29', 12.1) u",
  );
  check(
    "QR URL",
    qr.u ===
      "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=12345678Z&numserie=MOS-2026-0003&fecha=29-09-2026&importe=12.10",
    qr.u,
  );
  const seen = await run("select count(*)::int n from public.sales_verifactu_records");
  check("a trusted admin reads the records", (seen.rows?.[0]?.n ?? 0) >= 4, seen.error);
  claims = { sub: admin, role: "authenticated", session_id: randomUUID(), aal: "aal1" };
  const untrusted = await run("select count(*)::int n from public.sales_verifactu_records");
  check("an untrusted session reads none", untrusted.rows?.[0]?.n === 0, untrusted.error);
  const job = await one(
    "select count(*)::int n from cron.job where jobname = 'verifactu-dispatch'",
  );
  check("dispatch scheduled every minute", job.n === 1);
} catch (e) {
  console.error(e.message);
  failed++;
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
console.log(failed ? `\n${failed} failed (rolled back)` : "\nAll passed (rolled back)");
process.exitCode = failed ? 1 : 0;
