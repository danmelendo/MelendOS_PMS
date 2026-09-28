// Imports a hotel's bookings from its previous system (CSV exported from a
// spreadsheet; columns in docs/alta-hotel.md and scripts/reservas.example.csv).
// All or nothing, in one transaction: if one row fails (unknown room, the
// room already taken those nights…) nothing is imported. Without --apply it
// only checks and rolls back.
//
//   node --env-file=.env scripts/import-reservations.ts <hotel-slug> reservas.csv
//   node --env-file=.env scripts/import-reservations.ts <hotel-slug> reservas.csv --apply
//
// Imported bookings are created_by_role = 'import': no confirmation email and
// no SES.HOSPEDAJES booking report on creation (the previous system did
// both); check-in, cancellation and invoices work as for any other booking.
import { readFileSync } from "node:fs";
import pg from "pg";
import { ymdInZone, zonedHourToUtc } from "../supabase/functions/_shared/domain/dates.ts";
import {
  importedStatus,
  reservationsFromCsv,
} from "../supabase/functions/_shared/onboarding/reservations-csv.ts";

const [slug, file] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const apply = process.argv.includes("--apply");
if (!slug || !file) {
  console.error("Uso: import-reservations.ts <slug-del-hotel> <reservas.csv> [--apply]");
  process.exit(1);
}

const sheet = reservationsFromCsv(readFileSync(file, "utf8"));
if (sheet.problems.length) {
  console.error(
    `La hoja tiene ${sheet.problems.length} problema(s):\n- ${sheet.problems.join("\n- ")}`,
  );
  process.exit(1);
}

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await db.connect();
try {
  await db.query("begin");
  const tenant = (
    await db.query<{ id: string; settings: Record<string, unknown> }>(
      "select id, settings from public.tenants where slug = $1",
      [slug],
    )
  ).rows[0];
  if (!tenant) throw new Error(`No existe el hotel ${slug}`);
  const tz = String(tenant.settings.timezone ?? "Europe/Madrid");
  const inHour = Number(tenant.settings.checkin_hour ?? 15);
  const outHour = Number(tenant.settings.checkout_hour ?? 12);
  const today = ymdInZone(new Date(), tz);

  const rooms = new Map<string, { id: string; property_id: string; capacity: number }>();
  for (const r of (
    await db.query<{
      id: string;
      property_id: string;
      capacity: number;
      room: string;
      property: string;
    }>(
      `select r.id, r.property_id, r.capacity, r.name as room, p.name as property
         from public.rooms r join public.properties p on p.id = r.property_id
        where r.tenant_id = $1`,
      [tenant.id],
    )
  ).rows)
    rooms.set(`${r.property.toLowerCase()}|${r.room.toLowerCase()}`, r);

  const counts: Record<string, number> = {};
  for (const r of sheet.reservations) {
    const room = rooms.get(`${r.property.toLowerCase()}|${r.room.toLowerCase()}`);
    if (!room) throw new Error(`Fila ${r.row}: no existe la habitación ${r.room} en ${r.property}`);
    if (r.guests > room.capacity)
      throw new Error(
        `Fila ${r.row}: la habitación ${r.room} admite ${room.capacity} personas, no ${r.guests}`,
      );
    const customerId = (
      await db.query<{ id: string }>(
        "select public.find_or_create_customer($1, $2, $3, $4) as id",
        [tenant.id, r.name, r.email, r.phone],
      )
    ).rows[0].id;
    const status = importedStatus(r, today);
    const notes = [r.reference ? `Importada · ref. ${r.reference}` : "Importada", r.notes]
      .filter(Boolean)
      .join(" · ");
    await db.query("savepoint row");
    try {
      await db.query(
        `insert into public.reservations
           (tenant_id, room_id, property_id, customer_id, start_at, end_at, people, base_price, total,
            deposit_amount, paid_amount, deposit_paid, payment_mode, status, created_by_role, internal_notes,
            cancellation_category)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10, $11, $12, $13, 'import', $14, $15)`,
        [
          tenant.id,
          room.id,
          room.property_id,
          customerId,
          zonedHourToUtc(r.checkIn, inHour, tz).toISOString(),
          zonedHourToUtc(r.checkOut, outHour, tz).toISOString(),
          r.guests,
          r.total,
          r.paymentMode === "prepay" ? r.total : 0,
          r.paid,
          r.paymentMode === "prepay" && r.paid >= r.total,
          r.paymentMode,
          status,
          notes,
          status === "cancelled" ? "other" : null,
        ],
      );
    } catch (e) {
      const err = e as { code?: string; message: string };
      throw new Error(
        `Fila ${r.row}: ${err.code === "23P01" ? `la habitación ${r.room} ya está ocupada esas noches` : err.message}`,
      );
    }
    await db.query("release savepoint row");
    counts[status] = (counts[status] ?? 0) + 1;
  }

  const summary = Object.entries(counts)
    .map(([s, n]) => `${n} ${s}`)
    .join(", ");
  console.log(
    `${apply ? "Importadas" : "Comprobadas (sin guardar)"}: ${sheet.reservations.length} reservas de ${slug} (${summary}).`,
  );
  await db.query(apply ? "commit" : "rollback");
  if (!apply) console.log("Todo correcto. Repite con --apply para importarlas.");
} catch (e) {
  await db.query("rollback");
  console.error(`No se importó nada: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
