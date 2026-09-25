// Row Level Security tests against a real Postgres (SUPABASE_DB_URL).
//
// Everything runs inside one transaction that is rolled back at the end, so the
// suite never leaves data behind. If the schema is not there yet, the base
// migration and the seed are applied inside that transaction first.
//
// Run: npm run test:db
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";

const DB_URL = process.env.SUPABASE_DB_URL;
const sid = (k: string) => {
  // md5(k)::uuid, same as the seed.
  return client.query<{ id: string }>("select md5($1)::uuid as id", [k]).then((r) => r.rows[0].id);
};

let client: pg.Client;
const users = {
  lumenAdmin: "00000000-0000-4000-8000-000000000001",
  lumenReception: "00000000-0000-4000-8000-000000000002",
  alboraAdmin: "00000000-0000-4000-8000-000000000003",
  guestAlex: "00000000-0000-4000-8000-000000000004",
  otherGuest: "00000000-0000-4000-8000-000000000005",
};
const ids: Record<string, string> = {};

async function as(role: "anon" | "authenticated", userId?: string) {
  await client.query("reset role");
  await client.query(
    "select set_config('request.jwt.claims', $1, true), set_config('request.headers', '{}', true)",
    [JSON.stringify(userId ? { sub: userId, role } : { role })],
  );
  await client.query(`set local role ${role}`);
}

/** Runs fn in a savepoint that is always rolled back, as the given identity. */
async function attempt<T>(
  role: "anon" | "authenticated",
  userId: string | undefined,
  fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  await client.query("savepoint t");
  try {
    await as(role, userId);
    const value = await fn();
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    await client.query("rollback to savepoint t");
    await client.query("reset role");
  }
}

const count = async (sql: string, params: unknown[] = []) =>
  Number((await client.query(sql, params)).rows[0].n);

describe.skipIf(!DB_URL)("RLS", () => {
  beforeAll(async () => {
    client = new pg.Client({ connectionString: DB_URL });
    await client.connect();
    await client.query("begin");
    const exists = (await client.query("select to_regclass('public.tenants') as t")).rows[0].t;
    if (!exists) {
      const dir = "supabase/migrations";
      for (const f of readdirSync(dir).sort()) {
        await client.query(readFileSync(`${dir}/${f}`, "utf8"));
      }
      await client.query(readFileSync("supabase/seed.sql", "utf8"));
    }
    for (const [name, id] of Object.entries(users)) {
      await client.query(
        "insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated') on conflict (id) do nothing",
        [id, `${name.toLowerCase()}@test.demostays.example`],
      );
    }
    for (const k of [
      "lumen",
      "albora",
      "lumen-res-r2",
      "albora-res-r6",
      "lumen-room-101",
      "albora-room-101",
      "lumen-rg-standard",
      "lumen-member-alex",
      "albora-member-alex",
      "lumen-res-alex-past",
    ]) {
      ids[k] = await sid(k);
    }
    await client.query(
      `insert into public.tenant_members (tenant_id, user_id, role) values
         ($1, $3, 'admin'), ($1, $4, 'reception'), ($2, $5, 'admin')
       on conflict do nothing`,
      [ids.lumen, ids.albora, users.lumenAdmin, users.lumenReception, users.alboraAdmin],
    );
    await client.query("update public.members set user_id = $1 where id in ($2, $3)", [
      users.guestAlex,
      ids["lumen-member-alex"],
      ids["albora-member-alex"],
    ]);
  });

  afterAll(async () => {
    if (!client) return;
    await client.query("rollback");
    await client.end();
  });

  describe("anonymous visitor (public web)", () => {
    it("reads the active catalogue of every hotel", async () => {
      const r = await attempt("anon", undefined, () =>
        count("select count(*) as n from public.rooms"),
      );
      expect(r).toEqual({ ok: true, value: 21 });
    });

    it("cannot read reservations, guests, payments or events", async () => {
      for (const t of [
        "reservations",
        "customers",
        "members",
        "payment_accounts",
        "payments",
        "promo_codes",
        "domain_events",
        "agent_runs",
        "tenant_members",
      ]) {
        const r = await attempt("anon", undefined, () =>
          count(`select count(*) as n from public.${t}`),
        );
        expect(r, t).toEqual({ ok: true, value: 0 });
      }
    });

    it("cannot create reservations directly", async () => {
      const r = await attempt("anon", undefined, () =>
        client.query(
          `insert into public.reservations (tenant_id, room_id, start_at, end_at, created_by_role)
           values ($1, $2, now() + interval '30 days', now() + interval '31 days', 'public')`,
          [ids.lumen, ids["lumen-room-101"]],
        ),
      );
      expect(r.ok).toBe(false);
    });

    it("sees busy windows without guest data, and can validate promo codes", async () => {
      const busy = await attempt("anon", undefined, () =>
        client.query(
          "select * from public.room_busy_windows($1, now() - interval '5 days', now() + interval '30 days')",
          [ids.lumen],
        ),
      );
      expect(busy.ok).toBe(true);
      if (busy.ok) {
        expect(busy.value.rows.length).toBeGreaterThan(0);
        expect(Object.keys(busy.value.rows[0]).sort()).toEqual(["end_at", "room_id", "start_at"]);
      }
      const promo = await attempt("anon", undefined, () =>
        count("select count(*) as n from public.validate_promo_code($1, 'otono15')", [ids.lumen]),
      );
      expect(promo).toEqual({ ok: true, value: 1 });
      const otherTenant = await attempt("anon", undefined, () =>
        count("select count(*) as n from public.validate_promo_code($1, 'otono15')", [ids.albora]),
      );
      expect(otherTenant).toEqual({ ok: true, value: 0 });
    });

    it("cannot execute server-side functions", async () => {
      for (const sql of [
        "select public.cancel_stale_pending_reservations()",
        `select public.find_or_create_customer('${"00000000-0000-0000-0000-000000000000"}', 'x', 'x@example.com')`,
        `select public.redeem_promo_code('${"00000000-0000-0000-0000-000000000000"}')`,
        `select public.extend_cleaning_and_shift('${"00000000-0000-0000-0000-000000000000"}', 60)`,
      ]) {
        const r = await attempt("anon", undefined, () => client.query(sql));
        expect(r.ok, sql).toBe(false);
        if (!r.ok) expect(r.error, sql).toMatch(/permission denied/);
      }
    });
  });

  describe("hotel staff", () => {
    it("see only their own tenant's reservations", async () => {
      const r = await attempt("authenticated", users.lumenReception, async () => ({
        mine: await count("select count(*) as n from public.reservations where tenant_id = $1", [
          ids.lumen,
        ]),
        other: await count("select count(*) as n from public.reservations where tenant_id = $1", [
          ids.albora,
        ]),
      }));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.mine).toBeGreaterThan(0);
        expect(r.value.other).toBe(0);
      }
    });

    it("insert into their tenant by default and cannot write into another", async () => {
      const own = await attempt("authenticated", users.lumenReception, async () => {
        const res = await client.query<{ tenant_id: string }>(
          `insert into public.customers (name) values ('Walk-in') returning tenant_id`,
        );
        return res.rows[0].tenant_id;
      });
      expect(own).toEqual({ ok: true, value: ids.lumen });

      const other = await attempt("authenticated", users.lumenReception, () =>
        client.query(`insert into public.customers (tenant_id, name) values ($1, 'Intruso')`, [
          ids.albora,
        ]),
      );
      expect(other.ok).toBe(false);
    });

    it("cannot book a room of another hotel even inside their own tenant", async () => {
      const r = await attempt("authenticated", users.lumenAdmin, () =>
        client.query(
          `insert into public.reservations (tenant_id, room_id, start_at, end_at)
           values ($1, $2, now() + interval '40 days', now() + interval '41 days')`,
          [ids.lumen, ids["albora-room-101"]],
        ),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/foreign key/);
    });

    it("only admins change rates", async () => {
      const reception = await attempt(
        "authenticated",
        users.lumenReception,
        async () =>
          (
            await client.query("update public.rate_nightly set price = 1 where tenant_id = $1", [
              ids.lumen,
            ])
          ).rowCount,
      );
      expect(reception).toEqual({ ok: true, value: 0 });
      const admin = await attempt(
        "authenticated",
        users.lumenAdmin,
        async () =>
          (
            await client.query(
              "update public.rate_nightly set price = price where tenant_id = $1",
              [ids.lumen],
            )
          ).rowCount,
      );
      expect(admin.ok && admin.value).toBeGreaterThan(0);
    });

    it("cannot shift reservations of another hotel", async () => {
      const r = await attempt("authenticated", users.alboraAdmin, () =>
        client.query("select public.extend_cleaning_and_shift($1, 60)", [ids["lumen-res-r2"]]),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/No autorizado/);
    });
  });

  describe("business rules", () => {
    it("rejects a stay that overlaps another one plus its cleaning time", async () => {
      const r = await attempt("authenticated", users.lumenAdmin, () =>
        client.query(
          `insert into public.reservations (room_id, start_at, end_at, status)
           select room_id, end_at, end_at + interval '1 day', 'confirmed'
           from public.reservations where id = $1`,
          [ids["lumen-res-r2"]],
        ),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/limpieza/);
    });

    it("records reservation changes as domain events visible to admins only", async () => {
      const r = await attempt("authenticated", users.lumenAdmin, async () => {
        await client.query("update public.reservations set status = 'cancelled' where id = $1", [
          ids["lumen-res-r2"],
        ]);
        return count(
          "select count(*) as n from public.domain_events where entity_id = $1 and event_type = 'reservation.cancelled'",
          [ids["lumen-res-r2"]],
        );
      });
      expect(r).toEqual({ ok: true, value: 1 });

      const reception = await attempt("authenticated", users.lumenReception, () =>
        count("select count(*) as n from public.domain_events"),
      );
      expect(reception).toEqual({ ok: true, value: 0 });

      const tamper = await attempt("authenticated", users.lumenAdmin, () =>
        client.query("delete from public.domain_events"),
      );
      expect(tamper.ok).toBe(false);
    });
  });

  describe("guests (guest app)", () => {
    it("see their own stays in each hotel and nobody else's", async () => {
      const r = await attempt("authenticated", users.guestAlex, () =>
        count("select count(*) as n from public.reservations"),
      );
      expect(r).toEqual({ ok: true, value: 2 });
      const other = await attempt("authenticated", users.otherGuest, () =>
        count("select count(*) as n from public.reservations"),
      );
      expect(other).toEqual({ ok: true, value: 0 });
    });

    it("can file requests for themselves only", async () => {
      const own = await attempt("authenticated", users.guestAlex, () =>
        client.query(
          `insert into public.incidents (tenant_id, member_id, category, title, description)
           values ($1, $2, 'housekeeping', 'Toallas', 'Dos toallas más, por favor')`,
          [ids.lumen, ids["lumen-member-alex"]],
        ),
      );
      expect(own.ok).toBe(true);
      const forged = await attempt("authenticated", users.otherGuest, () =>
        client.query(
          `insert into public.incidents (tenant_id, member_id, category, title, description)
           values ($1, $2, 'housekeeping', 'x', 'x')`,
          [ids.lumen, ids["lumen-member-alex"]],
        ),
      );
      expect(forged.ok).toBe(false);
    });

    it("cannot read other guests' loyalty or invoices", async () => {
      const r = await attempt("authenticated", users.otherGuest, async () => ({
        loyalty: await count("select count(*) as n from public.loyalty_accounts"),
        invoices: await count("select count(*) as n from public.invoices"),
      }));
      expect(r).toEqual({ ok: true, value: { loyalty: 0, invoices: 0 } });
    });
  });
});
