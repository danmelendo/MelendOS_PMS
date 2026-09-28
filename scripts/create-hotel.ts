// Creates a hotel from a JSON file (see scripts/hotel.example.json and
// docs/alta-hotel.md): the tenant with its policies and packages, its
// establishments, nightly rates and rooms, in one transaction; then invites
// its staff (an email to choose their password, or added directly if the
// account exists).
//
//   node --env-file=.env scripts/create-hotel.ts hotel.json                 # check only (rollback)
//   node --env-file=.env scripts/create-hotel.ts hotel.json --apply --app-url https://panel.melendo.app
//   … hotel.json --rooms habitaciones.csv    # rooms and rates from the hotel's spreadsheet
//
// Platform tool: it uses the database URL and the service key of the project
// in the .env loaded (check which one before --apply).
import { readFileSync } from "node:fs";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import {
  hotelSettings,
  hotelSpec,
  specProblems,
  type HotelSpec,
} from "../supabase/functions/_shared/onboarding/hotel.ts";
import { roomsFromCsv } from "../supabase/functions/_shared/onboarding/csv.ts";

const args = process.argv.slice(2);
const option = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const file = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const roomsCsv = option("--rooms");
const apply = args.includes("--apply");
const appUrl = option("--app-url");
const { SUPABASE_DB_URL, SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;

if (!file) {
  console.error(
    "Uso: create-hotel.ts <hotel.json> [--rooms habitaciones.csv] [--apply --app-url <url del panel>]",
  );
  process.exit(1);
}
if (apply && !/^https?:\/\/[^/]+$/.test(appUrl ?? "")) {
  console.error(
    "--apply necesita --app-url (dirección del panel, para el enlace de la invitación)",
  );
  process.exit(1);
}
const raw = JSON.parse(readFileSync(file, "utf8")) as {
  rates?: unknown;
  properties?: { name?: string; rooms?: unknown }[];
};
// Rooms and rates from the spreadsheet replace those of the file.
if (roomsCsv) {
  const sheet = roomsFromCsv(readFileSync(roomsCsv, "utf8"));
  const names = new Set((raw.properties ?? []).map((p) => p.name));
  const unknown = [...new Set(sheet.rooms.map((r) => r.property))].filter((p) => !names.has(p));
  if (sheet.problems.length || unknown.length) {
    console.error(
      `La hoja tiene problemas:\n- ${[
        ...sheet.problems,
        ...unknown.map((p) => `El establecimiento «${p}» no está en ${file}`),
      ].join("\n- ")}`,
    );
    process.exit(1);
  }
  raw.rates = sheet.rates;
  for (const p of raw.properties ?? [])
    p.rooms = sheet.rooms.filter((r) => r.property === p.name).map(({ property: _p, ...r }) => r);
}
const problems = specProblems(raw);
if (problems.length) {
  console.error(`El fichero tiene ${problems.length} problema(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
const h: HotelSpec = hotelSpec.parse(raw);

const db = new pg.Client({ connectionString: SUPABASE_DB_URL });
await db.connect();
let tenantId: string;
try {
  await db.query("begin");
  const taken = await db.query("select 1 from public.tenants where slug = $1 or domain = $2", [
    h.slug,
    h.domain ?? null,
  ]);
  if (taken.rowCount)
    throw new Error(`Ya existe un hotel con el slug ${h.slug} o el dominio ${h.domain}`);

  tenantId = (
    await db.query<{ id: string }>(
      `insert into public.tenants (slug, name, domain, status, plan, brand, settings)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        h.slug,
        h.name,
        h.domain ?? null,
        h.status,
        h.plan,
        { name: h.name, ...h.brand },
        hotelSettings(h),
      ],
    )
  ).rows[0].id;

  const rateIds = new Map<string, string>();
  for (const r of h.rates) {
    const id = (
      await db.query<{ id: string }>(
        "insert into public.rate_groups (tenant_id, name) values ($1, $2) returning id",
        [tenantId, r.name],
      )
    ).rows[0].id;
    await db.query(
      "insert into public.rate_nightly (tenant_id, rate_group_id, price, weekend_price) values ($1, $2, $3, $4)",
      [tenantId, id, r.price, r.weekend_price ?? null],
    );
    rateIds.set(r.name, id);
  }

  let rooms = 0;
  for (const [pi, p] of h.properties.entries()) {
    const provinceId = p.province
      ? (
          await db.query<{ id: string }>(
            "insert into public.provinces (tenant_id, name, sort_order) values ($1, $2, $3) returning id",
            [tenantId, p.province, pi],
          )
        ).rows[0].id
      : null;
    const propertyId = (
      await db.query<{ id: string }>(
        `insert into public.properties (tenant_id, province_id, name, city, address, description, amenities, sort_order)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [
          tenantId,
          provinceId,
          p.name,
          p.city,
          p.address ?? null,
          p.description ?? null,
          p.amenities,
          pi,
        ],
      )
    ).rows[0].id;
    for (const [ri, r] of p.rooms.entries()) {
      await db.query(
        `insert into public.rooms (tenant_id, property_id, building, name, capacity, asset_type, features, rate_group_id, sort_order)
         values ($1, $2, $3, $4, $5, $6::public.room_category, $7, $8, $9)`,
        [
          tenantId,
          propertyId,
          r.building ?? p.name,
          r.name,
          r.capacity,
          r.type,
          r.features,
          rateIds.get(r.rate),
          ri,
        ],
      );
      rooms++;
    }
  }

  console.log(
    `${apply ? "Creado" : "Comprobado (sin guardar)"}: ${h.name} (${h.slug}), ${h.properties.length} establecimiento(s), ${rooms} habitaciones, ${h.rates.length} tarifa(s).`,
  );
  await db.query(apply ? "commit" : "rollback");
} catch (e) {
  await db.query("rollback");
  console.error(`No se creó nada: ${(e as Error).message}`);
  await db.end();
  process.exit(1);
}

if (!apply) {
  await db.end();
  console.log(
    "Todo correcto. Repite con --apply --app-url <url del panel> para crearlo e invitar al equipo.",
  );
  process.exit(0);
}

// Staff: invitation (new email) or membership (existing account).
const auth = createClient(SUPABASE_URL!, SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const staff = [
  ...h.admins.map((email) => ({ email, role: "admin" })),
  ...h.reception.map((email) => ({ email, role: "reception" })),
];
for (const s of staff) {
  const existing = await db.query<{ id: string }>(
    "select id from auth.users where lower(email) = $1",
    [s.email],
  );
  let userId = existing.rows[0]?.id;
  if (!userId) {
    const { data, error } = await auth.auth.admin.inviteUserByEmail(s.email, {
      redirectTo: `${appUrl}/reset-password`,
    });
    if (error || !data.user) {
      console.error(`  ${s.email}: no se pudo invitar (${error?.message}). Invítalo desde Equipo.`);
      continue;
    }
    userId = data.user.id;
  }
  await db.query(
    "insert into public.tenant_members (tenant_id, user_id, role) values ($1, $2, $3) on conflict do nothing",
    [tenantId!, userId, s.role],
  );
  console.log(
    `  ${s.email}: ${existing.rowCount ? "añadido" : "invitado"} (${s.role === "admin" ? "dirección" : "recepción"})`,
  );
}
await db.end();
console.log(
  "Siguientes pasos: datos fiscales (Facturación), pasarela de pago, SES.HOSPEDAJES y web (Web y dominio) desde el panel.",
);
