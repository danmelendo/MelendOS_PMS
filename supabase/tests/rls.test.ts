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
import { FEATURES, tenantFeatures } from "../functions/_shared/domain/features.ts";
import { CANCELLATION_CATEGORY_IDS } from "../functions/_shared/domain/cancellations.ts";

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
      // The demo database is live: count Alex's stays instead of assuming the seed's 2.
      const own = await count(
        "select count(*) as n from public.reservations where member_id in ($1, $2)",
        [ids["lumen-member-alex"], ids["albora-member-alex"]],
      );
      const r = await attempt("authenticated", users.guestAlex, () =>
        count("select count(*) as n from public.reservations"),
      );
      expect(own).toBeGreaterThanOrEqual(2);
      expect(r).toEqual({ ok: true, value: own });
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
    async function pendingGuestStay(dayOffset: number, paid = false, freeWindowOver = false) {
      // A Lumen room free on those nights (the demo has real stays around today).
      const room = (
        await client.query<{ id: string }>(
          `select r.id from public.rooms r
            where r.tenant_id = $1 and r.active
              and not exists (select 1 from public.reservations x
                               where x.room_id = r.id and x.status not in ('cancelled', 'no_show', 'rejected')
                                 and x.start_at < now() + make_interval(days => $2 + 2)
                                 and x.end_at > now() + make_interval(days => $2 - 1))
            order by r.name limit 1`,
          [ids.lumen, dayOffset],
        )
      ).rows[0].id;
      const res = await client.query<{ id: string }>(
        `insert into public.reservations (tenant_id, room_id, member_id, start_at, end_at, status, deposit_paid, paid_amount, total, created_by_role, free_cancellation_until)
         values ($1, $2, $3, now() + make_interval(days => $4), now() + make_interval(days => $4 + 1), $5, $6,
                 case when $6 then 100 else 0 end, 100, 'member',
                 case when $7 then now() - interval '1 hour' end)
         returning id`,
        [
          ids.lumen,
          room,
          ids["lumen-member-alex"],
          dayOffset,
          paid ? "confirmed" : "pending",
          paid,
          freeWindowOver,
        ],
      );
      return res.rows[0].id;
    }

    it("a guest cancels for free inside the window; later it is a request", async () => {
      await client.query("savepoint setup");
      const pending = await pendingGuestStay(90);
      const paidEarly = await pendingGuestStay(95, true);
      const paidLate = await pendingGuestStay(100, true, true); // free window already over
      const cancel = (user: string, id: string) =>
        attempt("authenticated", user, () =>
          client.query("select public.cancel_my_reservation($1)", [id]),
        );
      expect((await cancel(users.guestAlex, pending)).ok).toBe(true);
      expect((await cancel(users.otherGuest, pending)).ok).toBe(false);

      await asIdentity("authenticated", users.guestAlex, () =>
        client.query("select public.cancel_my_reservation($1)", [paidEarly]),
      );
      const refund = await count(
        "select count(*) as n from public.domain_events where entity_id = $1 and event_type = 'payment.refund_required'",
        [paidEarly],
      );
      const late = await cancel(users.guestAlex, paidLate);
      const request = await asIdentity(
        "authenticated",
        users.guestAlex,
        async () =>
          (
            await client.query(
              "select public.request_guest_cancellation($1, null, 'Vuelo cancelado') as id",
              [paidLate],
            )
          ).rows[0].id,
      );
      const statuses = (
        await client.query("select id, status from public.reservations where id = any($1)", [
          [paidEarly, paidLate],
        ])
      ).rows;
      await client.query("rollback to savepoint setup");

      expect(refund).toBe(1);
      expect(late.ok).toBe(false);
      if (!late.ok) expect(late.error).toMatch(/plazo/);
      expect(request).toMatch(/^[0-9a-f-]{36}$/);
      expect(statuses.find((r) => r.id === paidEarly)?.status).toBe("cancelled");
      expect(statuses.find((r) => r.id === paidLate)?.status).toBe("confirmed");
    });

    it("every booking keeps the cancellation terms it was made with", async () => {
      await client.query("savepoint setup");
      await client.query(
        `update public.tenants set settings = settings || '{"cancellation": {"free_hours": 48, "penalty": "first_night"}}'::jsonb where id = $1`,
        [ids.lumen],
      );
      const r = (
        await client.query(
          `insert into public.reservations (tenant_id, room_id, start_at, end_at, status, total, created_by_role, payment_mode)
           values ($1, $2, '2031-05-10T13:00:00Z', '2031-05-13T10:00:00Z', 'confirmed', 300, 'reception', 'at_hotel')
           returning free_cancellation_until, late_cancellation_fee, payment_mode, deposit_amount`,
          [ids.lumen, ids["lumen-room-101"]],
        )
      ).rows[0];
      // Changing the policy afterwards does not change the booking.
      await client.query(
        `update public.tenants set settings = settings || '{"cancellation": {"free_hours": 0, "penalty": "full"}}'::jsonb where id = $1`,
        [ids.lumen],
      );
      await client.query("rollback to savepoint setup");
      expect(new Date(r.free_cancellation_until).toISOString()).toBe("2031-05-08T13:00:00.000Z");
      expect(Number(r.late_cancellation_fee)).toBe(100);
      expect(r.payment_mode).toBe("at_hotel");
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
          null, // cancellation_category
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
  describe("folio: charges, extensions and payments", () => {
    async function inHouse(total = 200, paid = 60, days = [400, 402]) {
      const r = await client.query<{ id: string }>(
        `insert into public.reservations (tenant_id, room_id, start_at, end_at, status, total, base_price, paid_amount, deposit_paid, created_by_role, access_token_hash)
         values ($1, $2, now() + make_interval(days => $5), now() + make_interval(days => $6), 'in_progress', $3, $3, $4, true, 'public',
                 encode(extensions.digest('folio-token', 'sha256'), 'hex'))
         returning id`,
        [ids.lumen, ids["lumen-room-101"], total, paid, days[0], days[1]],
      );
      return r.rows[0].id;
    }
    const service = async () =>
      (
        await client.query(
          `insert into public.stay_services (tenant_id, category, name, price, unit)
           values ($1, 'laundry', 'Lavandería test', 15, 'bolsa') returning id`,
          [ids.lumen],
        )
      ).rows[0].id as string;
    const balance = async (id: string) =>
      Number((await client.query("select public.folio_balance($1) as b", [id])).rows[0].b);

    it("guests order services; reception confirms them into the balance", async () => {
      await client.query("savepoint setup");
      const id = await inHouse();
      const svc = await service();
      await asIdentity("anon", undefined, () =>
        client.query("select public.order_service($1, 'folio-token', $2, 2, 'sin suavizante')", [
          id,
          svc,
        ]),
      );
      const wrong = await attempt("anon", undefined, () =>
        client.query("select public.order_service($1, 'guess', $2, 1)", [id, svc]),
      );
      const anonTable = await attempt("anon", undefined, () =>
        count("select count(*) as n from public.folio_charges"),
      );
      const beforePost = await balance(id);
      const chat = (
        await client.query(
          "select body from public.stay_messages where reservation_id = $1 and sender = 'guest'",
          [id],
        )
      ).rows[0]?.body;
      await asIdentity("authenticated", users.lumenReception, () =>
        client.query(
          "update public.folio_charges set status = 'posted' where reservation_id = $1",
          [id],
        ),
      );
      const afterPost = await balance(id);
      const folio = await asIdentity(
        "anon",
        undefined,
        async () =>
          (await client.query("select public.get_folio($1, 'folio-token') as f", [id])).rows[0].f,
      );
      await client.query("rollback to savepoint setup");

      expect(wrong.ok).toBe(false);
      expect(anonTable).toEqual({ ok: true, value: 0 });
      expect(beforePost).toBe(140); // 200 - 60: requested orders do not count yet
      expect(chat).toBe("Pedido: 2 × Lavandería test — sin suavizante");
      expect(afterPost).toBe(170);
      expect(folio.balance).toBe(170);
      expect(folio.charges[0]).toMatchObject({ amount: 30, status: "posted" });
    });

    it("posted charges are never edited, voiding needs a reason, other hotels cannot touch them", async () => {
      await client.query("savepoint setup");
      const id = await inHouse();
      const charge = await asIdentity(
        "authenticated",
        users.lumenReception,
        async () =>
          (
            await client.query(
              `insert into public.folio_charges (tenant_id, reservation_id, category, description, qty, unit_price, source, created_by)
               values ($1, $2, 'other', 'Botella de vino', 1, 25, 'staff', $3) returning id`,
              [ids.lumen, id, users.lumenReception],
            )
          ).rows[0].id as string,
      );
      const edit = await attempt("authenticated", users.lumenReception, () =>
        client.query("update public.folio_charges set unit_price = 1 where id = $1", [charge]),
      );
      const noReason = await attempt("authenticated", users.lumenReception, () =>
        client.query("update public.folio_charges set status = 'void' where id = $1", [charge]),
      );
      const otherHotel = await attempt(
        "authenticated",
        users.alboraAdmin,
        async () =>
          (
            await client.query(
              "update public.folio_charges set status = 'void', void_reason = 'x' where id = $1",
              [charge],
            )
          ).rowCount,
      );
      const asGuest = await attempt("authenticated", users.lumenReception, () =>
        client.query(
          `insert into public.folio_charges (tenant_id, reservation_id, category, description, unit_price, source, created_by)
           values ($1, $2, 'other', 'x', 1, 'guest', $3)`,
          [ids.lumen, id, users.lumenReception],
        ),
      );
      await client.query("rollback to savepoint setup");
      expect(edit.ok).toBe(false);
      expect(noReason.ok).toBe(false);
      expect(otherHotel).toEqual({ ok: true, value: 0 });
      expect(asGuest.ok).toBe(false);
    });

    it("reception approves an extension: new check-out and total; a taken room blocks it", async () => {
      await client.query("savepoint setup");
      const id = await inHouse(200, 60, [500, 502]);
      const end = (await client.query("select end_at from public.reservations where id = $1", [id]))
        .rows[0].end_at as Date;
      const newEnd = new Date(end.getTime() + 86_400_000);
      const ext = (
        await client.query(
          `insert into public.stay_extensions (tenant_id, reservation_id, new_check_out, new_end_at, nights, amount)
           values ($1, $2, $3::date, $4, 1, 110) returning id`,
          [ids.lumen, id, newEnd.toISOString().slice(0, 10), newEnd.toISOString()],
        )
      ).rows[0].id;
      const other = await attempt("authenticated", users.alboraAdmin, () =>
        client.query("select public.decide_extension($1, true)", [ext]),
      );
      await asIdentity("authenticated", users.lumenReception, () =>
        client.query("select public.decide_extension($1, true)", [ext]),
      );
      const after = (
        await client.query("select end_at, total from public.reservations where id = $1", [id])
      ).rows[0];

      // Another stay right after blocks a second extension.
      await client.query(
        `insert into public.reservations (tenant_id, room_id, start_at, end_at, status, created_by_role)
         values ($1, $2, $3::timestamptz + interval '3 hours', $3::timestamptz + interval '2 days', 'confirmed', 'admin')`,
        [ids.lumen, ids["lumen-room-101"], newEnd.toISOString()],
      );
      const later = new Date(newEnd.getTime() + 86_400_000);
      const ext2 = (
        await client.query(
          `insert into public.stay_extensions (tenant_id, reservation_id, new_check_out, new_end_at, nights, amount)
           values ($1, $2, $3::date, $4, 1, 110) returning id`,
          [ids.lumen, id, later.toISOString().slice(0, 10), later.toISOString()],
        )
      ).rows[0].id;
      const blocked = await attempt("authenticated", users.lumenReception, () =>
        client.query("select public.decide_extension($1, true)", [ext2]),
      );
      await client.query("rollback to savepoint setup");

      expect(other.ok).toBe(false);
      expect(new Date(after.end_at).toISOString()).toBe(newEnd.toISOString());
      expect(Number(after.total)).toBe(310);
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) expect(blocked.error).toMatch(/no está libre/);
    });

    it("desk payments settle the balance, never more", async () => {
      await client.query("savepoint setup");
      const id = await inHouse(200, 60);
      const pay = (amount: number, user = users.lumenReception) =>
        attempt("authenticated", user, () =>
          client.query("select public.record_desk_payment($1, $2, 'card')", [id, amount]),
        );
      const tooMuch = await pay(141);
      const otherHotel = await pay(10, users.alboraAdmin);
      const anon = await attempt("anon", undefined, () =>
        client.query("select public.record_desk_payment($1, 10, 'cash')", [id]),
      );
      await asIdentity("authenticated", users.lumenReception, () =>
        client.query("select public.record_desk_payment($1, 140, 'cash')", [id]),
      );
      const left = await balance(id);
      const payment = (
        await client.query(
          "select provider, kind, status, amount from public.payments where reservation_id = $1",
          [id],
        )
      ).rows[0];
      await client.query("rollback to savepoint setup");
      expect(tooMuch.ok).toBe(false);
      expect(otherHotel.ok).toBe(false);
      expect(anon.ok).toBe(false);
      expect(left).toBe(0);
      expect(payment).toMatchObject({ provider: "desk", kind: "balance", status: "succeeded" });
      expect(Number(payment.amount)).toBe(140);
    });
  });
  describe("manage my booking on the web", () => {
    it("finds a booking by reference and email and keeps the old link working", async () => {
      await client.query("savepoint setup");
      const c = await client.query<{ id: string }>(
        "insert into public.customers (tenant_id, name, email) values ($1, 'Ana Web', 'Ana.Web@example.com') returning id",
        [ids.lumen],
      );
      const r = await client.query<{ id: string; reference: string }>(
        `insert into public.reservations (tenant_id, room_id, customer_id, start_at, end_at, status, created_by_role, access_token_hash)
         values ($1, $2, $3, now() + interval '450 days', now() + interval '452 days', 'confirmed', 'public',
                 encode(extensions.digest('email-link', 'sha256'), 'hex'))
         returning id, reference`,
        [ids.lumen, ids["lumen-room-101"], c.rows[0].id],
      );
      const { id, reference } = r.rows[0];
      const find = (tenant: string, ref: string, email: string) =>
        asIdentity(
          "anon",
          undefined,
          async () =>
            (
              await client.query("select public.find_guest_booking($1, $2, $3) as f", [
                tenant,
                ref,
                email,
              ])
            ).rows[0].f,
        );
      const found = await find(ids.lumen, reference.toLowerCase(), " ana.web@EXAMPLE.com ");
      const wrongEmail = await find(ids.lumen, reference, "otra@example.com");
      const otherHotel = await find(ids.albora, reference, "ana.web@example.com");
      const open = (token: string) =>
        asIdentity(
          "anon",
          undefined,
          async () =>
            (await client.query("select public.get_guest_booking($1, $2) as b", [id, token]))
              .rows[0].b,
        );
      const withNew = await open(found.token);
      const withOld = await open("email-link");
      const tableRead = await attempt("anon", undefined, () =>
        count("select count(*) as n from public.booking_access_tokens"),
      );
      await client.query("rollback to savepoint setup");

      expect(found.id).toBe(id);
      expect(found.token).toMatch(/^[0-9a-f]{48}$/);
      expect(wrongEmail).toBeNull();
      expect(otherHotel).toBeNull();
      expect(withNew?.id).toBe(id);
      expect(withOld?.id).toBe(id);
      expect(tableRead).toEqual({ ok: true, value: 0 });
    });

    it("guests without an account see the active services catalogue", async () => {
      const anon = await attempt("anon", undefined, () =>
        count("select count(*) as n from public.stay_services where tenant_id = $1", [ids.lumen]),
      );
      expect(anon.ok).toBe(true);
      if (anon.ok) expect(anon.value).toBeGreaterThanOrEqual(0);
    });
  });

  describe("MCP access tokens", () => {
    const create = (userId: string, tenant: string, scopes: string[]) =>
      attempt("authenticated", userId, async () => {
        const r = await client.query("select public.create_mcp_token($1, 'Test', $2, 30) as t", [
          tenant,
          scopes,
        ]);
        return r.rows[0].t;
      });

    it("only an admin of the hotel creates, lists or revokes them", async () => {
      const reception = await create(users.lumenReception, ids.lumen, ["read"]);
      const otherHotel = await create(users.alboraAdmin, ids.lumen, ["read"]);
      expect(reception.ok).toBe(false);
      expect(otherHotel.ok).toBe(false);

      await client.query("savepoint setup");
      const t = await asIdentity(
        "authenticated",
        users.lumenAdmin,
        async () =>
          (
            await client.query(
              "select public.create_mcp_token($1, 'Claude', array['write'], 30) as t",
              [ids.lumen],
            )
          ).rows[0].t,
      );
      const listOther = await attempt("authenticated", users.alboraAdmin, () =>
        client.query("select public.list_mcp_tokens($1)", [ids.lumen]),
      );
      const revokeOther = await attempt("authenticated", users.alboraAdmin, () =>
        client.query("select public.revoke_mcp_token($1)", [t.id]),
      );
      const listed = await asIdentity(
        "authenticated",
        users.lumenAdmin,
        async () =>
          (await client.query("select public.list_mcp_tokens($1) as l", [ids.lumen])).rows[0].l,
      );
      const stored = (
        await client.query("select token_hash from public.mcp_tokens where id = $1", [t.id])
      ).rows[0];
      await client.query("rollback to savepoint setup");

      expect(t.token).toMatch(/^dsm_[0-9a-f]{48}$/);
      expect(t.scopes).toEqual(["read", "write"]);
      expect(listOther.ok).toBe(false);
      expect(revokeOther.ok).toBe(false);
      expect(listed).toHaveLength(1);
      expect(JSON.stringify(listed)).not.toContain(stored.token_hash);
      expect(JSON.stringify(listed)).not.toContain(t.token);
    });

    it("the table and the token check are closed to users", async () => {
      const read = await attempt("authenticated", users.lumenAdmin, () =>
        count("select count(*) as n from public.mcp_tokens"),
      );
      const check = await attempt("authenticated", users.lumenAdmin, () =>
        client.query("select public.mcp_token_auth('x')"),
      );
      const anonCreate = await attempt("anon", undefined, () =>
        client.query("select public.create_mcp_token($1, 'x', array['read'], 30)", [ids.lumen]),
      );
      expect(read.ok).toBe(false);
      expect(check.ok).toBe(false);
      expect(anonCreate.ok).toBe(false);
    });

    it("a revoked or expired token no longer authenticates", async () => {
      await client.query("savepoint setup");
      const t = await asIdentity(
        "authenticated",
        users.lumenAdmin,
        async () =>
          (
            await client.query(
              "select public.create_mcp_token($1, 'Claude', array['read'], 30) as t",
              [ids.lumen],
            )
          ).rows[0].t,
      );
      const auth = async () =>
        (
          await client.query(
            "select public.mcp_token_auth(encode(extensions.digest($1, 'sha256'), 'hex')) as a",
            [t.token],
          )
        ).rows[0].a;
      const valid = await auth();
      await client.query(
        "update public.mcp_tokens set expires_at = now() - interval '1 second' where id = $1",
        [t.id],
      );
      const expired = await auth();
      await client.query(
        "update public.mcp_tokens set expires_at = now() + interval '1 day' where id = $1",
        [t.id],
      );
      await asIdentity("authenticated", users.lumenAdmin, () =>
        client.query("select public.revoke_mcp_token($1)", [t.id]),
      );
      const revoked = await auth();
      await client.query("rollback to savepoint setup");

      expect(valid).toMatchObject({ tenant_id: ids.lumen, scopes: ["read"], calls_last_minute: 0 });
      expect(expired).toBeNull();
      expect(revoked).toBeNull();
    });
  });

  describe("packages and modules", () => {
    const setTenant = (plan: string, settings: object) =>
      client.query(
        "update public.tenants set plan = $2, settings = (settings - 'packages' - 'features') || $3::jsonb where id = $1",
        [ids.lumen, plan, JSON.stringify(settings)],
      );

    it("the SQL rule matches the TypeScript one", async () => {
      const cases: [string, object][] = [
        ["starter", {}],
        ["pro", {}],
        ["group", {}],
        ["unknown", {}],
        ["starter", { packages: ["ai", "data", "nonsense"] }],
        ["pro", { packages: [] }],
        ["starter", { features: { loyalty: true, chat: false } }],
        ["pro", { features: { loyalty: "no" } }],
      ];
      await client.query("savepoint setup");
      const mismatches: string[] = [];
      for (const [plan, settings] of cases) {
        await setTenant(plan, settings);
        const expected = tenantFeatures(plan, settings);
        for (const f of FEATURES) {
          const got = (
            await client.query("select public.tenant_feature($1, $2) as on", [ids.lumen, f])
          ).rows[0].on;
          if (got !== expected[f]) mismatches.push(`${plan} ${JSON.stringify(settings)} ${f}`);
        }
      }
      await client.query("rollback to savepoint setup");
      expect(mismatches).toEqual([]);
    });

    it("without the AI package: no MCP tokens, and existing ones stop working", async () => {
      await client.query("savepoint setup");
      await setTenant("starter", { packages: ["stay", "ai"] });
      const t = await asIdentity(
        "authenticated",
        users.lumenAdmin,
        async () =>
          (
            await client.query(
              "select public.create_mcp_token($1, 'Claude', array['read'], 30) as t",
              [ids.lumen],
            )
          ).rows[0].t,
      );
      await setTenant("starter", { packages: ["stay"] });
      const refused = await attempt("authenticated", users.lumenAdmin, () =>
        client.query("select public.create_mcp_token($1, 'x', array['read'], 30)", [ids.lumen]),
      );
      const auth = (
        await client.query(
          "select public.mcp_token_auth(encode(extensions.digest($1, 'sha256'), 'hex')) as a",
          [t.token],
        )
      ).rows[0].a;
      await client.query("rollback to savepoint setup");

      expect(refused.ok).toBe(false);
      expect(auth).toBeNull();
    });

    it("reports and the data lake only cover hotels with the data package", async () => {
      await client.query("savepoint setup");
      await setTenant("starter", { packages: ["stay"] });
      const report = await asIdentity(
        "authenticated",
        users.lumenAdmin,
        async () =>
          (
            await client.query(
              "select public.report_stays(current_date - 30, current_date, $1) as r",
              [ids.lumen],
            )
          ).rows[0].r,
      );
      const lake = (await client.query("select array_agg(t) as ids from public.lake_tenants() t"))
        .rows[0].ids as string[];
      await client.query("rollback to savepoint setup");

      expect(report.stays).toEqual([]);
      expect(lake).not.toContain(ids.lumen);
      expect(lake).toContain(ids.albora);
    });
  });

  describe("cancellation reasons", () => {
    const booking = async (days: number) =>
      (
        await client.query<{ id: string }>(
          `insert into public.reservations (tenant_id, room_id, start_at, end_at, status, total, deposit_amount, created_by_role)
           values ($1, $2, now() + make_interval(days => $3), now() + make_interval(days => $3 + 2),
                   'confirmed', 200, 0, 'admin') returning id`,
          [ids.lumen, ids["lumen-room-101"], days],
        )
      ).rows[0].id;
    const category = async (id: string) =>
      (
        await client.query(
          "select cancellation_category as c from public.reservations where id = $1",
          [id],
        )
      ).rows[0].c;

    it("the SQL list matches the TypeScript one", async () => {
      const rows = await client.query(
        "select c, public.is_cancellation_category(c) as ok from unnest($1::text[]) c",
        [[...CANCELLATION_CATEGORY_IDS, "bored"]],
      );
      expect(rows.rows.filter((r) => !r.ok).map((r) => r.c)).toEqual(["bored"]);
    });

    it("every cancelled or rejected booking gets a group; a reinstated one loses it", async () => {
      await client.query("savepoint setup");
      const a = await booking(230);
      const b = await booking(240);
      await client.query("update public.reservations set status = 'cancelled' where id = $1", [a]);
      await client.query("update public.reservations set status = 'rejected' where id = $1", [b]);
      const afterCancel = [await category(a), await category(b)];
      await client.query("update public.reservations set status = 'confirmed' where id = $1", [a]);
      const reinstated = await category(a);
      const bad = await attempt("authenticated", users.lumenAdmin, () =>
        client.query(
          "update public.reservations set status = 'cancelled', cancellation_category = 'bored' where id = $1",
          [a],
        ),
      );
      await client.query("rollback to savepoint setup");

      expect(afterCancel).toEqual(["no_reason", "payment_not_completed"]);
      expect(reinstated).toBeNull();
      expect(bad.ok).toBe(false);
    });

    it("reception classifies the reason when approving a request", async () => {
      await client.query("savepoint setup");
      const id = await booking(250);
      const request = (
        await client.query<{ id: string }>(
          `insert into public.cancellation_requests (tenant_id, reservation_id, reason, category, channel)
           values ($1, $2, 'Me han cambiado el viaje de trabajo', 'change_of_plans', 'web') returning id`,
          [ids.lumen, id],
        )
      ).rows[0].id;
      await asIdentity("authenticated", users.lumenReception, () =>
        client.query("select public.decide_cancellation($1, true, 'Llamó el cliente', 'work')", [
          request,
        ]),
      );
      const row = (
        await client.query(
          "select cancellation_category, cancellation_note from public.reservations where id = $1",
          [id],
        )
      ).rows[0];
      await client.query("rollback to savepoint setup");

      expect(row).toEqual({ cancellation_category: "work", cancellation_note: "Llamó el cliente" });
    });
  });

  describe("guest identities (sensitive data)", () => {
    /** Staff member who signed in `ago` seconds ago (the JWT's amr claim). */
    async function identify(userId: string, ago: number) {
      await client.query("reset role");
      const claims = {
        sub: userId,
        role: "authenticated",
        amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) - ago }],
      };
      await client.query(
        "select set_config('request.jwt.claims', $1, true), set_config('request.headers', '{}', true)",
        [JSON.stringify(claims)],
      );
      await client.query("set local role authenticated");
    }
    /** Runs fn as that identity and keeps what it did. */
    async function signedIn<T>(userId: string, ago: number, fn: () => Promise<T>): Promise<T> {
      await identify(userId, ago);
      try {
        return await fn();
      } finally {
        await client.query("reset role");
      }
    }
    /** Runs fn as that identity in a savepoint that is always rolled back. */
    const tryAs = async <T>(userId: string, ago: number, fn: () => Promise<T>) => {
      await client.query("savepoint t");
      try {
        await identify(userId, ago);
        return { ok: true as const, value: await fn() };
      } catch (e) {
        return { ok: false as const, error: (e as Error).message };
      } finally {
        await client.query("rollback to savepoint t");
        await client.query("reset role");
      }
    };
    const identity = {
      document_type: "dni",
      document_number: "12345678z",
      nationality: "es",
      birth_date: "1985-04-12",
      address_line: "Calle Mayor, 1",
      city: "Valencia",
      country: "ES",
    };

    it("reception records them but cannot read them back", async () => {
      await client.query("savepoint setup");
      const c = (
        await client.query<{ id: string }>(
          "insert into public.customers (tenant_id, name, email) values ($1, 'Ana Test', 'ana.id@example.com') returning id",
          [ids.lumen],
        )
      ).rows[0].id;
      await signedIn(users.lumenReception, 30, () =>
        client.query("select public.save_guest_identity($1, $2)", [c, identity]),
      );
      const readByReception = await tryAs(users.lumenReception, 30, () =>
        client.query("select public.get_guest_identity($1)", [c]),
      );
      const tableRead = await tryAs(users.lumenAdmin, 30, () =>
        client.query("select * from public.guest_identities"),
      );
      const fresh = await tryAs(
        users.lumenAdmin,
        60,
        async () =>
          (await client.query("select public.get_guest_identity($1) as g", [c])).rows[0].g,
      );
      const stale = await tryAs(users.lumenAdmin, 3600, () =>
        client.query("select public.get_guest_identity($1)", [c]),
      );
      const otherHotel = await tryAs(users.alboraAdmin, 30, () =>
        client.query("select public.get_guest_identity($1)", [c]),
      );
      const directory = await signedIn(
        users.lumenReception,
        30,
        async () =>
          (
            await client.query(
              "select * from public.customer_directory($1, 'Ana Test') where id = $2",
              [ids.lumen, c],
            )
          ).rows[0],
      );
      const writeOther = await tryAs(users.alboraAdmin, 30, () =>
        client.query("select public.save_guest_identity($1, $2)", [c, identity]),
      );
      await signedIn(users.lumenAdmin, 60, () =>
        client.query("select public.get_guest_identity($1)", [c]),
      );
      const log = (
        await client.query("select action from public.audit_log where entity_id = $1 order by at", [
          c,
        ])
      ).rows.map((r) => r.action);
      await client.query("rollback to savepoint setup");

      expect(readByReception.ok).toBe(false);
      expect(tableRead.ok).toBe(false);
      expect(fresh).toMatchObject({
        ok: true,
        value: { document_number: "12345678Z", nationality: "ES", city: "Valencia" },
      });
      expect(stale.ok).toBe(false);
      if (!stale.ok) expect(stale.error).toMatch(/identificarte/);
      expect(otherHotel.ok).toBe(false);
      expect(writeOther.ok).toBe(false);
      expect(directory).toMatchObject({ has_identity: true, name: "Ana Test" });
      expect(JSON.stringify(directory)).not.toContain("12345678");
      expect(log).toEqual(["guest_identity.saved", "guest_identity.viewed"]);
    });
  });

  describe("group management role", () => {
    const groupUser = "00000000-0000-4000-8000-000000000009";

    it("reads and manages every hotel of the group, but does not operate", async () => {
      await client.query("savepoint setup");
      await client.query(
        "insert into auth.users (id, email, aud, role) values ($1, 'grupo@test.demostays.example', 'authenticated', 'authenticated') on conflict (id) do nothing",
        [groupUser],
      );
      await client.query(
        "insert into public.tenant_members (tenant_id, user_id, role) values ($1, $3, 'group'), ($2, $3, 'group')",
        [ids.lumen, ids.albora, groupUser],
      );
      const booking = (
        await client.query<{ id: string }>(
          `insert into public.reservations (tenant_id, room_id, start_at, end_at, status, total, created_by_role)
           values ($1, $2, now() + interval '260 days', now() + interval '262 days', 'confirmed', 200, 'admin')
           returning id`,
          [ids.lumen, ids["lumen-room-101"]],
        )
      ).rows[0].id;
      const request = (
        await client.query<{ id: string }>(
          "insert into public.cancellation_requests (tenant_id, reservation_id, channel) values ($1, $2, 'web') returning id",
          [ids.lumen, booking],
        )
      ).rows[0].id;

      const seesBoth = await attempt(
        "authenticated",
        groupUser,
        async () =>
          (
            await client.query(
              "select count(distinct tenant_id)::int as n from public.reservations where tenant_id in ($1, $2)",
              [ids.lumen, ids.albora],
            )
          ).rows[0].n,
      );
      const book = await attempt("authenticated", groupUser, () =>
        client.query(
          `insert into public.reservations (tenant_id, room_id, start_at, end_at, status, total, created_by_role)
           values ($1, $2, now() + interval '270 days', now() + interval '272 days', 'confirmed', 100, 'admin')`,
          [ids.lumen, ids["lumen-room-101"]],
        ),
      );
      const checkIn = await attempt("authenticated", groupUser, () =>
        client.query("update public.reservations set status = 'in_progress' where id = $1", [
          booking,
        ]),
      );
      const decide = await attempt("authenticated", groupUser, () =>
        client.query("select public.decide_cancellation($1, true)", [request]),
      );
      const message = await attempt("authenticated", groupUser, () =>
        client.query(
          "insert into public.stay_messages (tenant_id, reservation_id, sender, body, staff_id) values ($1, $2, 'staff', 'Hola', $3)",
          [ids.lumen, booking, groupUser],
        ),
      );
      const rates = await attempt(
        "authenticated",
        groupUser,
        async () =>
          (
            await client.query(
              "update public.rate_nightly set price = price + 1 where tenant_id = $1 returning id",
              [ids.albora],
            )
          ).rowCount,
      );
      const tokens = await attempt("authenticated", groupUser, () =>
        client.query("select public.list_mcp_tokens($1)", [ids.albora]),
      );
      const reception = await attempt("authenticated", users.lumenReception, () =>
        client.query("update public.reservations set status = 'in_progress' where id = $1", [
          booking,
        ]),
      );
      await client.query("rollback to savepoint setup");

      expect(seesBoth).toEqual({ ok: true, value: 2 });
      for (const [what, r] of Object.entries({ book, checkIn, decide, message })) {
        expect(r.ok, what).toBe(false);
        if (!r.ok) expect(r.error, what).toMatch(/grupo|row-level security/);
      }
      expect(rates.ok && rates.value).toBeGreaterThan(0);
      expect(tokens.ok).toBe(true);
      expect(reception.ok).toBe(true);
    });
  });

  describe("distribution channels", () => {
    it("admins connect channels; the secret stays in Vault; bookings queue availability", async () => {
      await client.query("savepoint setup");
      await client.query(
        'update public.tenants set settings = settings || \'{"packages": ["stay", "distribution"]}\'::jsonb where id = $1',
        [ids.lumen],
      );
      const byReception = await attempt("authenticated", users.lumenReception, () =>
        client.query("select public.create_channel($1, 'ota', 'demo', 'OTA')", [ids.lumen]),
      );
      const ch = await asIdentity(
        "authenticated",
        users.lumenAdmin,
        async () =>
          (
            await client.query(
              "select public.create_channel($1, 'ota', 'demo', 'OTA test', 15, jsonb_build_object('DBL', $2::text)) as c",
              [ids.lumen, ids["lumen-rg-standard"]],
            )
          ).rows[0].c,
      );
      const readSecret = await attempt("authenticated", users.lumenAdmin, () =>
        client.query("select public.channel_secret($1)", [ch.id]),
      );
      const seen = await attempt(
        "authenticated",
        users.lumenReception,
        async () =>
          (await client.query("select count(*)::int n from public.channels where id = $1", [ch.id]))
            .rows[0].n,
      );
      const otherHotel = await attempt(
        "authenticated",
        users.alboraAdmin,
        async () =>
          (await client.query("select count(*)::int n from public.channels where id = $1", [ch.id]))
            .rows[0].n,
      );
      const booking = (
        await client.query<{ id: string }>(
          `insert into public.reservations (tenant_id, room_id, start_at, end_at, status, total, created_by_role, channel_id, external_ref)
           values ($1, $2, now() + interval '300 days', now() + interval '302 days', 'confirmed', 200, 'ota', $3, 'X-1')
           returning id`,
          [ids.lumen, ids["lumen-room-101"], ch.id],
        )
      ).rows[0].id;
      const queued = Number(
        (
          await client.query(
            "select count(*) as n from public.channel_outbox where channel_id = $1 and payload->>'reservation_id' = $2",
            [ch.id, booking],
          )
        ).rows[0].n,
      );
      const duplicate = await attempt("authenticated", users.lumenAdmin, () =>
        client.query(
          `insert into public.reservations (tenant_id, room_id, start_at, end_at, status, total, created_by_role, channel_id, external_ref)
           values ($1, $2, now() + interval '320 days', now() + interval '322 days', 'confirmed', 200, 'ota', $3, 'X-1')`,
          [ids.lumen, ids["lumen-room-101"], ch.id],
        ),
      );
      await client.query("rollback to savepoint setup");

      expect(byReception.ok).toBe(false);
      expect(ch.secret).toMatch(/^dsc_[0-9a-f]{48}$/);
      expect(readSecret.ok).toBe(false);
      expect(seen).toEqual({ ok: true, value: 1 });
      expect(otherHotel).toEqual({ ok: true, value: 0 });
      expect(queued).toBe(1);
      expect(duplicate.ok).toBe(false);
    });
  });
});
