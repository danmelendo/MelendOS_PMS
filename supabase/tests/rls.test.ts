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

/** Switches the loyalty club on for a hotel (tests run inside the rollback). */
const clubOn = (tenantId: string) =>
  client.query(
    `update public.tenants set settings = settings || '{"features": {"loyalty": true}}'::jsonb where id = $1`,
    [tenantId],
  );

/** Runs fn as the given identity and keeps what it did (caller rolls back). */
async function asIdentity<T>(
  role: "anon" | "authenticated",
  userId: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  await as(role, userId);
  try {
    return await fn();
  } finally {
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

  describe("guest and staff actions", () => {
    // Pending stay of Alex at Lumen, created as the table owner for the tests.
    async function pendingGuestStay(dayOffset: number, paid = false) {
      const res = await client.query<{ id: string }>(
        `insert into public.reservations (tenant_id, room_id, member_id, start_at, end_at, status, deposit_paid, total, created_by_role)
         values ($1, $2, $3, now() + make_interval(days => $4), now() + make_interval(days => $4 + 1), $5, $6, 100, 'member')
         returning id`,
        [
          ids.lumen,
          ids["lumen-room-101"],
          ids["lumen-member-alex"],
          dayOffset,
          paid ? "confirmed" : "pending",
          paid,
        ],
      );
      return res.rows[0].id;
    }

    it("a guest cancels their own unpaid stay, not someone else's or a paid one", async () => {
      await client.query("savepoint setup");
      const pending = await pendingGuestStay(90);
      const paid = await pendingGuestStay(95, true);
      const own = await attempt("authenticated", users.guestAlex, () =>
        client.query("select public.cancel_my_reservation($1)", [pending]),
      );
      expect(own.ok).toBe(true);
      const other = await attempt("authenticated", users.otherGuest, () =>
        client.query("select public.cancel_my_reservation($1)", [pending]),
      );
      expect(other.ok).toBe(false);
      const paidAttempt = await attempt("authenticated", users.guestAlex, () =>
        client.query("select public.cancel_my_reservation($1)", [paid]),
      );
      expect(paidAttempt.ok).toBe(false);
      if (!paidAttempt.ok) expect(paidAttempt.error).toMatch(/hotel/);
      await client.query("rollback to savepoint setup");
    });

    it("a guest redeems rewards with enough points only, where there is a club", async () => {
      const noClub = await attempt("authenticated", users.guestAlex, async () => {
        const r = await client.query("select id from public.rewards where tenant_id = $1 limit 1", [
          ids.lumen,
        ]);
        return client.query("select public.redeem_reward($1, $2)", [
          ids["lumen-member-alex"],
          r.rows[0].id,
        ]);
      });
      expect(noClub.ok).toBe(false); // Lumen is on the starter plan: no club
      await client.query("savepoint club");
      await clubOn(ids.lumen);
      const cheap = (
        await client.query<{ id: string }>(
          "select id from public.rewards where tenant_id = $1 order by cost_points limit 1",
          [ids.lumen],
        )
      ).rows[0].id;
      const dear = (
        await client.query<{ id: string }>(
          "select id from public.rewards where tenant_id = $1 order by cost_points desc limit 1",
          [ids.lumen],
        )
      ).rows[0].id;
      const ok = await attempt("authenticated", users.guestAlex, async () =>
        Number(
          (
            await client.query("select public.redeem_reward($1, $2) as left", [
              ids["lumen-member-alex"],
              cheap,
            ])
          ).rows[0].left,
        ),
      );
      expect(ok).toEqual({ ok: true, value: 740 - 300 });
      const tooDear = await attempt("authenticated", users.guestAlex, () =>
        client.query("select public.redeem_reward($1, $2)", [ids["lumen-member-alex"], dear]),
      );
      expect(tooDear.ok).toBe(false);
      const forged = await attempt("authenticated", users.otherGuest, () =>
        client.query("select public.redeem_reward($1, $2)", [ids["lumen-member-alex"], cheap]),
      );
      expect(forged.ok).toBe(false);
      await client.query("rollback to savepoint club");
    });

    it("reception changes a room's status but not its other fields", async () => {
      const status = await attempt(
        "authenticated",
        users.lumenReception,
        async () =>
          (
            await client.query("update public.rooms set status = 'cleaning' where id = $1", [
              ids["lumen-room-101"],
            ])
          ).rowCount,
      );
      expect(status).toEqual({ ok: true, value: 1 });
      const rename = await attempt("authenticated", users.lumenReception, () =>
        client.query("update public.rooms set name = '999' where id = $1", [ids["lumen-room-101"]]),
      );
      expect(rename.ok).toBe(false);
    });

    it("a paid member stay earns points and is journaled (hotel with a club)", async () => {
      await client.query("savepoint setup");
      await clubOn(ids.lumen);
      const stay = await pendingGuestStay(100);
      await client.query(
        "update public.reservations set deposit_paid = true, status = 'confirmed' where id = $1",
        [stay],
      );
      const points = await count(
        "select count(*) as n from public.loyalty_transactions where reservation_id = $1 and type = 'earn'",
        [stay],
      );
      const journal = await client.query<{ event_type: string }>(
        "select event_type from public.booking_journal where booking_ref = $1 order by created_at, event_type",
        [stay],
      );
      await client.query("rollback to savepoint setup");
      expect(points).toBe(1);
      expect(journal.rows.map((r) => r.event_type).sort()).toEqual(
        ["confirmed", "created", "points_earned"].sort(),
      );
    });
  });

  describe("guest booking access with a token (no account)", () => {
    async function tokenStay() {
      const res = await client.query<{ id: string }>(
        `insert into public.reservations (tenant_id, room_id, start_at, end_at, status, total, deposit_amount, created_by_role, access_token_hash)
         values ($1, $2, now() + interval '200 days', now() + interval '201 days', 'pending', 100, 30, 'public',
                 encode(extensions.digest('secret-token', 'sha256'), 'hex'))
         returning id`,
        [ids.lumen, ids["lumen-room-101"]],
      );
      return res.rows[0].id;
    }

    it("reads, signs and cancels only with the right token", async () => {
      await client.query("savepoint setup");
      const id = await tokenStay();
      const read = await attempt(
        "anon",
        undefined,
        async () =>
          (await client.query("select public.get_guest_booking($1, $2) as b", [id, "secret-token"]))
            .rows[0].b,
      );
      expect(read.ok && read.value?.room_name).toBe("101");
      const wrong = await attempt(
        "anon",
        undefined,
        async () =>
          (await client.query("select public.get_guest_booking($1, $2) as b", [id, "guess"]))
            .rows[0].b,
      );
      expect(wrong).toEqual({ ok: true, value: null });
      const signWrong = await attempt("anon", undefined, () =>
        client.query("select public.sign_guest_registration($1, $2, 'Ana', 'data:x')", [
          id,
          "guess",
        ]),
      );
      expect(signWrong.ok).toBe(false);
      const sign = await attempt("anon", undefined, async () => {
        await client.query("select public.sign_guest_registration($1, $2, 'Ana Pérez', 'data:x')", [
          id,
          "secret-token",
        ]);
        return (
          await client.query("select public.get_guest_booking($1, $2) as b", [id, "secret-token"])
        ).rows[0].b.signature.status;
      });
      expect(sign).toEqual({ ok: true, value: "signed" });
      const cancel = await attempt("anon", undefined, async () => {
        await client.query("select public.cancel_guest_booking($1, $2)", [id, "secret-token"]);
        return (
          await client.query("select public.get_guest_booking($1, $2) as b", [id, "secret-token"])
        ).rows[0].b.status;
      });
      expect(cancel).toEqual({ ok: true, value: "cancelled" });
      await client.query("rollback to savepoint setup");
    });

    it("never works for bookings without a token", async () => {
      const r = await attempt(
        "anon",
        undefined,
        async () =>
          (
            await client.query("select public.get_guest_booking($1, $2) as b", [
              ids["lumen-res-r2"],
              "",
            ])
          ).rows[0].b,
      );
      expect(r).toEqual({ ok: true, value: null });
    });
  });
  describe("cancellation requests (decided by the hotel)", () => {
    async function requestFor() {
      const r = await client.query<{ id: string; reference: string }>(
        `insert into public.reservations (tenant_id, room_id, start_at, end_at, status, total, deposit_amount, created_by_role)
         values ($1, $2, now() + interval '210 days', now() + interval '212 days', 'confirmed', 200, 60, 'agent')
         returning id, reference`,
        [ids.lumen, ids["lumen-room-101"]],
      );
      const q = await client.query<{ id: string }>(
        `insert into public.cancellation_requests (tenant_id, reservation_id, reason, channel)
         values ($1, $2, 'Cambio de planes', 'web_chat') returning id`,
        [ids.lumen, r.rows[0].id],
      );
      return { reservation: r.rows[0], request: q.rows[0].id };
    }

    it("gives every booking a short reference", async () => {
      await client.query("savepoint setup");
      const { reservation } = await requestFor();
      await client.query("rollback to savepoint setup");
      expect(reservation.reference).toBe(
        reservation.id.replace(/-/g, "").slice(0, 8).toUpperCase(),
      );
    });

    it("are visible to the hotel staff only, and nobody writes them from the client", async () => {
      await client.query("savepoint setup");
      const { reservation } = await requestFor();
      const n = (role: "anon" | "authenticated", user?: string) =>
        attempt(role, user, () => count("select count(*) as n from public.cancellation_requests"));
      expect(await n("authenticated", users.lumenReception)).toEqual({ ok: true, value: 1 });
      expect(await n("authenticated", users.alboraAdmin)).toEqual({ ok: true, value: 0 });
      expect(await n("authenticated", users.guestAlex)).toEqual({ ok: true, value: 0 });
      expect(await n("anon")).toEqual({ ok: true, value: 0 });
      for (const [role, user] of [
        ["anon", undefined],
        ["authenticated", users.lumenAdmin],
      ] as const) {
        const insert = await attempt(role, user, () =>
          client.query(
            "insert into public.cancellation_requests (tenant_id, reservation_id) values ($1, $2)",
            [ids.lumen, reservation.id],
          ),
        );
        expect(insert.ok, role).toBe(false);
      }
      await client.query("rollback to savepoint setup");
    });

    it("are approved by staff of the same hotel, once", async () => {
      await client.query("savepoint setup");
      const { reservation, request } = await requestFor();
      const decide = (role: "anon" | "authenticated", user?: string) =>
        attempt(role, user, () =>
          client.query("select public.decide_cancellation($1, true, 'ok')", [request]),
        );
      const anon = await decide("anon");
      expect(anon.ok).toBe(false);
      const other = await decide("authenticated", users.alboraAdmin);
      expect(other.ok).toBe(false);
      if (!other.ok) expect(other.error).toMatch(/no encontrada/);

      await as("authenticated", users.lumenReception);
      await client.query("select public.decide_cancellation($1, true, 'ok')", [request]);
      await client.query("reset role");
      const state = (
        await client.query(
          `select r.status, r.cancellation_reason, c.status as request_status, c.decided_by,
                  (select count(*) from public.domain_events e
                    where e.entity_id = r.id and e.event_type = 'cancellation.approved') as events
             from public.reservations r join public.cancellation_requests c on c.reservation_id = r.id
            where c.id = $1`,
          [request],
        )
      ).rows[0];
      const twice = await decide("authenticated", users.lumenReception);
      await client.query("rollback to savepoint setup");
      expect(state).toMatchObject({
        status: "cancelled",
        cancellation_reason: "Cambio de planes",
        request_status: "approved",
        decided_by: users.lumenReception,
      });
      expect(Number(state.events)).toBe(1);
      expect(twice.ok).toBe(false);
      void reservation;
    });

    it("rejecting leaves the booking untouched", async () => {
      await client.query("savepoint setup");
      const { reservation, request } = await requestFor();
      await as("authenticated", users.lumenAdmin);
      await client.query("select public.decide_cancellation($1, false, 'Tarifa no reembolsable')", [
        request,
      ]);
      await client.query("reset role");
      const status = (
        await client.query("select status from public.reservations where id = $1", [reservation.id])
      ).rows[0].status;
      await client.query("rollback to savepoint setup");
      expect(status).toBe("confirmed");
    });
  });
  describe("analytics and data lake", () => {
    async function stay(status = "confirmed") {
      const r = await client.query<{ id: string }>(
        `insert into public.reservations (tenant_id, room_id, start_at, end_at, status, base_price, total, created_at, created_by_role)
         values ($1, $2, '2031-10-01T13:00:00Z', '2031-10-03T10:00:00Z', $3, 200, 200, '2031-09-30T23:30:00Z', 'public')
         returning id`,
        [ids.lumen, ids["lumen-room-101"], status],
      );
      return r.rows[0].id;
    }
    const report = (role: "anon" | "authenticated", user?: string) =>
      attempt(
        role,
        user,
        async () =>
          (await client.query("select public.report_stays('2031-10-01', '2031-10-31') as j"))
            .rows[0].j,
      );

    it("report_stays gives staff their own hotel only, in hotel time", async () => {
      await client.query("savepoint setup");
      const id = await stay();
      const mine = await report("authenticated", users.lumenReception);
      const other = await report("authenticated", users.alboraAdmin);
      const anon = await report("anon");
      await client.query("rollback to savepoint setup");

      expect(mine.ok).toBe(true);
      if (mine.ok) {
        expect(Object.keys(mine.value.rooms)).toEqual([ids.lumen]);
        const row = mine.value.stays.find((s: unknown[]) => s[1] === ids["lumen-room-101"]);
        // 23:30 UTC on 30 Sep is already 1 Oct in Madrid.
        expect(row).toEqual([
          ids.lumen,
          ids["lumen-room-101"],
          "2031-10-01",
          "2031-10-03",
          "2031-10-01",
          null,
          "confirmed",
          "public",
          2,
          200,
        ]);
      }
      expect(other.ok && other.value.stays.some((s: unknown[]) => s[0] === ids.lumen)).toBe(false);
      expect(anon.ok).toBe(false);
      void id;
    });

    it("stamps cancelled_at when a booking is cancelled and clears it if reinstated", async () => {
      await client.query("savepoint setup");
      const id = await stay("pending");
      const at = async () =>
        (await client.query("select cancelled_at from public.reservations where id = $1", [id]))
          .rows[0].cancelled_at;
      const before = await at();
      await client.query("update public.reservations set status = 'cancelled' where id = $1", [id]);
      const cancelled = await at();
      await client.query("update public.reservations set status = 'pending' where id = $1", [id]);
      const reinstated = await at();
      await client.query("rollback to savepoint setup");
      expect(before).toBeNull();
      expect(cancelled).toBeInstanceOf(Date);
      expect(reinstated).toBeNull();
    });

    it("keeps the lake private and shows storage use to hotel admins only", async () => {
      await client.query("savepoint setup");
      await client.query(
        `insert into storage.objects (bucket_id, name, metadata)
         values ('lake', $1, '{"size": 1234}'::jsonb)`,
        [`tenant=${ids.lumen}/reservations/dt=2031-10-01/reservations.parquet`],
      );
      const read = (role: "anon" | "authenticated", user?: string) =>
        attempt(role, user, () =>
          count("select count(*) as n from storage.objects where bucket_id = 'lake'"),
        );
      const usage = (user: string) =>
        attempt("authenticated", user, async () =>
          (await client.query("select * from public.tenant_storage_usage()")).rows.map((r) => ({
            tenant_id: r.tenant_id,
            bytes: Number(r.bytes),
          })),
        );
      const anon = await read("anon");
      const staff = await read("authenticated", users.lumenAdmin);
      const admin = await usage(users.lumenAdmin);
      const reception = await usage(users.lumenReception);
      await client.query("rollback to savepoint setup");

      expect(anon).toEqual({ ok: true, value: 0 });
      expect(staff).toEqual({ ok: true, value: 0 });
      expect(admin.ok && admin.value.length).toBe(1);
      expect(admin.ok && admin.value[0].tenant_id).toBe(ids.lumen);
      expect(admin.ok && admin.value[0].bytes).toBeGreaterThanOrEqual(1234);
      expect(reception).toEqual({ ok: true, value: [] });
    });
  });
  describe("modules and reviews", () => {
    async function pastStay(status = "completed") {
      const c = await client.query<{ id: string }>(
        "insert into public.customers (tenant_id, name, email) values ($1, 'Laura Gómez', 'laura.rls@example.com') returning id",
        [ids.lumen],
      );
      const r = await client.query<{ id: string }>(
        `insert into public.reservations (tenant_id, room_id, property_id, customer_id, start_at, end_at, status, created_by_role, access_token_hash)
         values ($1, $2, (select property_id from public.rooms where id = $2), $3,
                 '2020-03-01T14:00:00Z', '2020-03-03T11:00:00Z', $4, 'public',
                 encode(extensions.digest('review-token', 'sha256'), 'hex'))
         returning id`,
        [ids.lumen, ids["lumen-room-101"], c.rows[0].id, status],
      );
      return r.rows[0].id;
    }
    const submit = (id: string, token: string | null, rating = 5, user?: string) =>
      attempt(
        user ? "authenticated" : "anon",
        user,
        async () =>
          (
            await client.query(
              `select public.submit_review($1, $2, $3, '{"staff": 5, "value": 9, "bogus": 3}'::jsonb, 'Muy bien') as id`,
              [id, token, rating],
            )
          ).rows[0].id,
      );

    it("the club comes with the pro plan: Lumen (starter) has none, Albora (pro) has it", async () => {
      const r = await client.query(
        "select public.tenant_feature($1, 'loyalty') as lumen, public.tenant_feature($2, 'loyalty') as albora, public.tenant_feature($1, 'reviews') as reviews",
        [ids.lumen, ids.albora],
      );
      expect(r.rows[0]).toEqual({ lumen: false, albora: true, reviews: true });
    });

    it("guests review a completed stay once, with its token", async () => {
      await client.query("savepoint setup");
      const id = await pastStay();
      const wrongToken = await submit(id, "guess");
      const ok = await asIdentity("anon", undefined, () =>
        client.query(
          "select public.submit_review($1, 'review-token', 5, '{\"staff\": 5, \"value\": 9, \"bogus\": 3}'::jsonb, 'Muy bien')",
          [id],
        ),
      ).then(() => ({ ok: true }));
      const twice = await submit(id, "review-token");
      const stored = (
        await client.query(
          "select rating, scores, author_name, comment from public.reviews where reservation_id = $1",
          [id],
        )
      ).rows[0];
      const mine = await attempt(
        "anon",
        undefined,
        async () =>
          (await client.query("select public.get_my_review($1, 'review-token') as r", [id])).rows[0]
            .r,
      );
      await client.query("rollback to savepoint setup");

      expect(wrongToken.ok).toBe(false);
      expect(ok.ok).toBe(true);
      expect(twice.ok).toBe(false);
      // Unknown and out-of-range scores dropped; public name shortened.
      expect(stored).toEqual({
        rating: 5,
        scores: { staff: 5 },
        author_name: "Laura G.",
        comment: "Muy bien",
      });
      expect(mine.ok && mine.value.rating).toBe(5);
    });

    it("stays that are not finished cannot be reviewed", async () => {
      await client.query("savepoint setup");
      const id = await pastStay("confirmed");
      const r = await submit(id, "review-token");
      await client.query("rollback to savepoint setup");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/terminada/);
    });

    it("the public sees reviews without booking data; staff of the hotel reply", async () => {
      await client.query("savepoint setup");
      const id = await pastStay();
      await asIdentity("anon", undefined, () =>
        client.query("select public.submit_review($1, 'review-token', 2)", [id]),
      );
      const reviewId = (
        await client.query("select id from public.reviews where reservation_id = $1", [id])
      ).rows[0].id;
      const table = await attempt("anon", undefined, () =>
        count("select count(*) as n from public.reviews"),
      );
      const pub = await attempt(
        "anon",
        undefined,
        async () =>
          (await client.query("select public.get_reviews(null, $1, 100) as j", [ids.lumen])).rows[0]
            .j,
      );
      const otherHotel = await attempt("authenticated", users.alboraAdmin, () =>
        client.query("select public.reply_review($1, 'Hola')", [reviewId]),
      );
      const reply = await attempt("authenticated", users.lumenReception, async () => {
        await client.query("select public.reply_review($1, 'Sentimos lo ocurrido')", [reviewId]);
        return (await client.query("select reply from public.reviews where id = $1", [reviewId]))
          .rows[0].reply;
      });
      await client.query("rollback to savepoint setup");

      expect(table).toEqual({ ok: true, value: 0 });
      expect(pub.ok).toBe(true);
      if (pub.ok) {
        const mine = pub.value.reviews.find((r: { id: string }) => r.id === reviewId);
        expect(mine).toMatchObject({ rating: 2, author_name: "Laura G." });
        expect(mine).not.toHaveProperty("reservation_id");
        expect(pub.value.count).toBeGreaterThanOrEqual(1);
      }
      expect(otherHotel.ok).toBe(false);
      expect(reply).toEqual({ ok: true, value: "Sentimos lo ocurrido" });
    });
  });
  describe("chat with reception", () => {
    async function stayWithToken(status = "in_progress", endsInDays = 2) {
      const r = await client.query<{ id: string }>(
        `insert into public.reservations (tenant_id, room_id, start_at, end_at, status, created_by_role, access_token_hash)
         values ($1, $2, now() + interval '400 days', now() + interval '400 days' + make_interval(days => $3), $4, 'public',
                 encode(extensions.digest('chat-token', 'sha256'), 'hex'))
         returning id`,
        [ids.lumen, ids["lumen-room-101"], endsInDays, status],
      );
      return r.rows[0].id;
    }
    const guestSays = (id: string, token: string, body = "¿Toallas, por favor?") =>
      asIdentity("anon", undefined, () =>
        client.query("select public.send_stay_message($1, $2, $3, 'towels') as id", [
          id,
          token,
          body,
        ]),
      );

    it("guests talk to reception with their booking token only", async () => {
      await client.query("savepoint setup");
      const id = await stayWithToken();
      const wrong = await attempt("anon", undefined, () =>
        client.query("select public.send_stay_message($1, 'guess', 'hola')", [id]),
      );
      await guestSays(id, "chat-token");
      const staffSees = await attempt("authenticated", users.lumenReception, () =>
        count("select count(*) as n from public.stay_messages where reservation_id = $1", [id]),
      );
      const otherHotel = await attempt("authenticated", users.alboraAdmin, () =>
        count("select count(*) as n from public.stay_messages where reservation_id = $1", [id]),
      );
      const anonTable = await attempt("anon", undefined, () =>
        count("select count(*) as n from public.stay_messages"),
      );
      await client.query("rollback to savepoint setup");

      expect(wrong.ok).toBe(false);
      expect(staffSees).toEqual({ ok: true, value: 1 });
      expect(otherHotel).toEqual({ ok: true, value: 0 });
      expect(anonTable).toEqual({ ok: true, value: 0 });
    });

    it("reception answers as themselves, can only mark as read, and the guest sees it read", async () => {
      await client.query("savepoint setup");
      const id = await stayWithToken();
      await guestSays(id, "chat-token");
      const insert = (sender: string, staffId: string) =>
        attempt("authenticated", users.lumenReception, () =>
          client.query(
            "insert into public.stay_messages (tenant_id, reservation_id, sender, body, staff_id) values ($1, $2, $3, 'Enseguida', $4)",
            [ids.lumen, id, sender, staffId],
          ),
        );
      const asGuest = await insert("guest", users.lumenReception);
      const asOther = await insert("staff", users.lumenAdmin);
      const edit = await attempt("authenticated", users.lumenReception, () =>
        client.query(
          "update public.stay_messages set body = 'cambiado' where reservation_id = $1",
          [id],
        ),
      );
      await asIdentity("authenticated", users.lumenReception, async () => {
        await client.query(
          "insert into public.stay_messages (tenant_id, reservation_id, sender, body, staff_id) values ($1, $2, 'staff', 'Enseguida', $3)",
          [ids.lumen, id, users.lumenReception],
        );
        await client.query(
          "update public.stay_messages set read_at = now() where reservation_id = $1 and sender = 'guest'",
          [id],
        );
      });
      const thread = await asIdentity(
        "anon",
        undefined,
        async () =>
          (await client.query("select public.get_stay_messages($1, 'chat-token') as m", [id]))
            .rows[0].m,
      );
      await client.query("rollback to savepoint setup");

      expect(asGuest.ok).toBe(false);
      expect(asOther.ok).toBe(false);
      expect(edit.ok).toBe(false);
      expect(thread.map((m: { sender: string }) => m.sender)).toEqual(["guest", "staff"]);
      expect(thread.every((m: { read_at: string | null }) => m.read_at)).toBe(true);
      expect(thread[0].category).toBe("towels");
    });

    it("closes the conversation of old stays", async () => {
      await client.query("savepoint setup");
      const r = await client.query<{ id: string }>(
        `insert into public.reservations (tenant_id, room_id, start_at, end_at, status, created_by_role, access_token_hash)
         values ($1, $2, '2020-01-01T14:00:00Z', '2020-01-03T11:00:00Z', 'completed', 'public',
                 encode(extensions.digest('chat-token', 'sha256'), 'hex'))
         returning id`,
        [ids.lumen, ids["lumen-room-101"]],
      );
      const closed = await attempt("anon", undefined, () =>
        client.query("select public.send_stay_message($1, 'chat-token', 'hola')", [r.rows[0].id]),
      );
      await client.query("rollback to savepoint setup");
      expect(closed.ok).toBe(false);
      if (!closed.ok) expect(closed.error).toMatch(/cerrada/);
    });
  });
});
