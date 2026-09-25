// Loads two years of simulated booking history (fictitious guests) into the demo
// database, plus the bookings already on the books for the coming months.
// Idempotent: previous simulated rows are replaced. Real bookings are kept and
// their nights are respected.
//
//   node --env-file=.env scripts/simulate-history.ts            # both demo hotels
//   node --env-file=.env scripts/simulate-history.ts --remove   # delete it
//
// Runs in one transaction. The journal and domain-event triggers are switched
// off inside it (they would stamp thousands of rows with today's date); the
// cleaning-gap trigger stays on as a final check against double bookings.
import pg from "pg";
import { addDays, zonedHourToUtc, ymdInZone } from "../supabase/functions/_shared/domain/dates.ts";
import {
  simCustomers,
  simulateHistory,
  type HotelProfile,
  type SimRoom,
} from "../supabase/functions/_shared/sim/history.ts";

const PROFILES: Record<string, { profile: HotelProfile; seed: number }> = {
  "hotel-lumen": { profile: "urban", seed: 1 },
  "albora-hotel-spa": { profile: "coastal", seed: 2 },
};
const HISTORY_DAYS = 730;
const AHEAD_DAYS = 240;
const QUIET_TRIGGERS = [
  "reservations_journal",
  "reservations_domain_events",
  "reservations_public_room_check",
];

const remove = process.argv.includes("--remove");
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await db.connect();

try {
  await db.query("begin");
  for (const t of QUIET_TRIGGERS) {
    await db.query(`alter table public.reservations disable trigger ${t}`);
  }
  const removed = await db.query("delete from public.reservations where simulated");
  const removedCustomers = await db.query("delete from public.customers where simulated");
  console.log(`Removed ${removed.rowCount} simulated stays, ${removedCustomers.rowCount} guests`);

  if (!remove) {
    const tenants = await db.query<{ id: string; slug: string; settings: Record<string, unknown> }>(
      "select id, slug, settings from public.tenants where slug = any($1)",
      [Object.keys(PROFILES)],
    );
    for (const tenant of tenants.rows) {
      const { profile, seed } = PROFILES[tenant.slug];
      const tz = String(tenant.settings.timezone ?? "Europe/Madrid");
      const checkinHour = Number(tenant.settings.checkin_hour ?? 15);
      const checkoutHour = Number(tenant.settings.checkout_hour ?? 12);
      const depositPct = Number(tenant.settings.deposit_pct ?? 30);
      const today = ymdInZone(new Date(), tz);

      const rooms = await db.query<SimRoom & { price: string; weekendPrice: string | null }>(
        `select r.id, r.tenant_id as "tenantId", r.property_id as "propertyId", r.capacity,
                n.price, n.weekend_price as "weekendPrice"
           from public.rooms r join public.rate_nightly n on n.rate_group_id = r.rate_group_id
          where r.tenant_id = $1 and r.active and r.status <> 'out_of_service'
          order by r.sort_order`,
        [tenant.id],
      );
      const busy = await db.query<{ roomId: string; checkIn: string; checkOut: string }>(
        `select room_id as "roomId",
                to_char((start_at at time zone $2)::date, 'YYYY-MM-DD') as "checkIn",
                to_char((end_at at time zone $2)::date, 'YYYY-MM-DD') as "checkOut"
           from public.reservations
          where tenant_id = $1 and status not in ('cancelled', 'no_show', 'rejected')`,
        [tenant.id, tz],
      );

      const { stays, customers } = simulateHistory({
        profile,
        seed,
        today,
        depositPct,
        from: addDays(today, -HISTORY_DAYS),
        to: addDays(today, AHEAD_DAYS),
        busy: busy.rows,
        rooms: rooms.rows.map((r) => ({
          ...r,
          price: Number(r.price),
          weekendPrice: r.weekendPrice == null ? null : Number(r.weekendPrice),
        })),
      });

      // Guests: first seen on their first booking.
      const pool = simCustomers(seed, customers);
      const firstSeen = new Map<number, string>();
      for (const s of stays) {
        const seen = firstSeen.get(s.customer);
        if (!seen || s.createdAt < seen) firstSeen.set(s.customer, s.createdAt);
      }
      for (let i = 0; i < pool.length; i += 500) {
        const chunk = pool.slice(i, i + 500);
        await db.query(
          `insert into public.customers (id, tenant_id, name, email, phone, created_at, simulated)
           select x.id, $1, x.name, x.email, x.phone, x.created_at, true
             from jsonb_to_recordset($2::jsonb)
                  as x(id uuid, name text, email text, phone text, created_at timestamptz)`,
          [
            tenant.id,
            JSON.stringify(chunk.map((c, j) => ({ ...c, created_at: firstSeen.get(i + j) }))),
          ],
        );
      }

      const rows = stays.map((s) => ({
        id: s.id,
        room_id: s.roomId,
        property_id: s.propertyId,
        customer_id: pool[s.customer].id,
        start_at: zonedHourToUtc(s.checkIn, checkinHour, tz).toISOString(),
        end_at: zonedHourToUtc(s.checkOut, checkoutHour, tz).toISOString(),
        people: s.guests,
        base_price: s.roomRevenue,
        total: s.roomRevenue,
        deposit_amount: s.deposit,
        deposit_paid: s.depositPaid,
        paid_amount: s.paidAmount,
        status: s.status,
        created_by_role: s.channel,
        created_at: s.createdAt,
        updated_at: s.cancelledAt ?? s.createdAt,
        cancelled_at: s.cancelledAt,
        cancellation_reason: s.cancelledAt ? "Cancelada por el huésped" : null,
      }));
      for (let i = 0; i < rows.length; i += 500) {
        await db.query(
          `insert into public.reservations
             (id, tenant_id, room_id, property_id, customer_id, start_at, end_at, people,
              base_price, total, deposit_amount, deposit_paid, paid_amount, status,
              created_by_role, created_at, updated_at, cancelled_at, cancellation_reason, simulated)
           select x.id, $1, x.room_id, x.property_id, x.customer_id, x.start_at, x.end_at, x.people,
                  x.base_price, x.total, x.deposit_amount, x.deposit_paid, x.paid_amount,
                  x.status::public.reservation_status, x.created_by_role, x.created_at,
                  x.updated_at, x.cancelled_at, x.cancellation_reason, true
             from jsonb_to_recordset($2::jsonb) as x(
               id uuid, room_id uuid, property_id uuid, customer_id uuid, start_at timestamptz,
               end_at timestamptz, people int, base_price numeric, total numeric,
               deposit_amount numeric, deposit_paid boolean, paid_amount numeric, status text,
               created_by_role text, created_at timestamptz, updated_at timestamptz,
               cancelled_at timestamptz, cancellation_reason text)`,
          [tenant.id, JSON.stringify(rows.slice(i, i + 500))],
        );
      }
      console.log(
        `${tenant.slug}: ${stays.length} stays (${stays.filter((s) => s.status === "cancelled").length} cancelled), ${pool.length} guests, ${rooms.rowCount} rooms`,
      );
    }
  }

  for (const t of QUIET_TRIGGERS) {
    await db.query(`alter table public.reservations enable trigger ${t}`);
  }
  await db.query("commit");
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  await db.end();
}
