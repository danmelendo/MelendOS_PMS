// Is this Supabase project ready to take real hotels? Read-only checklist of
// what DEPLOY.md asks of production: Auth, SMTP, backups, Edge Function
// secrets, scheduled jobs and no demo leftovers. Exits 1 if anything blocks.
// Usage (with the .env of the project to check loaded):
//   node --env-file=.env.production scripts/prod-check.mjs [--app-domain reservas.melendo.app]
// Needs SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF and SUPABASE_DB_URL.
import pg from "pg";

const { SUPABASE_ACCESS_TOKEN: token, SUPABASE_PROJECT_REF: ref, SUPABASE_DB_URL } = process.env;
if (!token || !ref || !SUPABASE_DB_URL) {
  console.error("Faltan SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF o SUPABASE_DB_URL.");
  process.exit(2);
}
const arg = (name) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const appDomain = arg("--app-domain");

const results = [];
/** level: "block" stops the go-live, "warn" is worth a look. */
const check = (area, what, ok, detail = "", level = "block") =>
  results.push({ area, what, ok: !!ok, detail, level });

async function api(path) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { error: `${res.status} ${await res.text().catch(() => "")}`.slice(0, 200) };
  return { data: await res.json() };
}

// --- Auth -----------------------------------------------------------------
const auth = await api("/config/auth");
if (auth.error) check("Auth", "Leer la configuración de Auth", false, auth.error);
else {
  const a = auth.data;
  const allow = String(a.uri_allow_list ?? "");
  check(
    "Auth",
    "Registro público desactivado",
    a.disable_signup === true,
    "Authentication → Sign In / Providers → «Allow new users to sign up» apagado",
  );
  check(
    "Auth",
    "Site URL de producción",
    a.site_url && !/localhost|127\.0\.0\.1/.test(a.site_url),
    `ahora: ${a.site_url || "vacía"}`,
  );
  check(
    "Auth",
    "Redirect URLs con /reset-password",
    /reset-password/.test(allow),
    "hace falta para recuperar contraseña e invitar al personal",
  );
  if (appDomain)
    check(
      "Auth",
      `Redirect URLs incluyen ${appDomain}`,
      allow.includes(appDomain),
      `ahora: ${allow || "vacío"}`,
    );
  check(
    "Auth",
    "SMTP propio",
    !!a.smtp_host,
    "el SMTP incluido solo envía unos pocos emails por hora",
  );
  check(
    "Auth",
    "Verificación en dos pasos (TOTP) activa",
    a.mfa_totp_enroll_enabled !== false && a.mfa_totp_verify_enabled !== false,
    "la pantalla «Mi cuenta» la usa",
  );
  check(
    "Auth",
    "Contraseñas de 10+ caracteres",
    Number(a.password_min_length ?? 6) >= 10,
    `ahora: ${a.password_min_length ?? 6}`,
    "warn",
  );
}

// --- Backups --------------------------------------------------------------
const backups = await api("/database/backups");
if (backups.error) check("Copias", "Leer las copias de seguridad", false, backups.error);
else {
  check(
    "Copias",
    "PITR (restauración a un momento) activo",
    backups.data.pitr_enabled === true,
    "complemento de pago; sin él solo hay copia diaria",
  );
  const last = (backups.data.backups ?? [])
    .map((b) => Date.parse(b.inserted_at))
    .sort()
    .pop();
  check(
    "Copias",
    "Copia de las últimas 48 h",
    last && Date.now() - last < 48 * 3600e3,
    last ? `última: ${new Date(last).toISOString()}` : "ninguna",
    backups.data.pitr_enabled ? "warn" : "block",
  );
}

// --- Edge Function secrets ------------------------------------------------
const secrets = await api("/secrets");
if (secrets.error) check("Secretos", "Leer los secretos de las funciones", false, secrets.error);
else {
  const names = new Set(secrets.data.map((s) => s.name));
  check(
    "Secretos",
    "Sin DEMO_ACCESS",
    !names.has("DEMO_ACCESS"),
    "habilita el acceso por desplegable y el cambio de módulos: nunca en producción",
  );
  for (const [name, why] of [
    ["RESEND_API_KEY", "emails al huésped"],
    ["EMAIL_FROM", "remitente de los emails al huésped"],
    ["GUEST_EMAILS_CRON_KEY", "envío programado de emails (scripts/emails-setup.mjs)"],
    ["CHANNELS_CRON_KEY", "envío programado a los canales (scripts/channels-setup.mjs)"],
    ["SES_CRON_KEY", "envío programado a SES.HOSPEDAJES (scripts/ses-setup.mjs)"],
    ["VERIFACTU_CRON_KEY", "envío programado a VERI*FACTU (scripts/verifactu-setup.mjs)"],
    ["VERIFACTU_PRODUCER_NAME", "productor del sistema de facturación"],
    ["VERIFACTU_PRODUCER_NIF", "productor del sistema de facturación"],
  ])
    check("Secretos", name, names.has(name), why);
  for (const name of ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"])
    check(
      "Secretos",
      name,
      names.has(name),
      "asistente de reservas y copiloto (solo si se vende el paquete IA)",
      "warn",
    );
}

// --- Database -------------------------------------------------------------
const db = new pg.Client({ connectionString: SUPABASE_DB_URL });
await db.connect();
await db.query("begin read only");
const one = async (sql) => (await db.query(sql)).rows[0];
try {
  const jobs = new Set(
    (await db.query("select jobname from cron.job where active")).rows.map((r) => r.jobname),
  );
  for (const job of [
    "guest-emails-dispatch",
    "channels-dispatch",
    "ses-dispatch",
    "verifactu-dispatch",
    "cancel-stale-pending",
    "archive-expired-promo-codes",
  ])
    check(
      "Tareas",
      `Cron «${job}»`,
      jobs.has(job),
      "lo crean las migraciones o el script *-setup.mjs correspondiente",
    );

  const demoUsers = await one(
    "select count(*)::int n from auth.users where email like '%demostays.example'",
  );
  check(
    "Datos",
    "Sin cuentas de la demo",
    demoUsers.n === 0,
    `${demoUsers.n} cuentas @demostays.example`,
  );
  const simulated = await one(
    "select (select count(*) from public.reservations where simulated)::int r, (select count(*) from public.customers where simulated)::int c",
  );
  check(
    "Datos",
    "Sin historial simulado",
    simulated.r + simulated.c === 0,
    `${simulated.r} reservas y ${simulated.c} clientes simulados`,
  );
  const demoHotels = await one(
    "select count(*)::int n from public.tenants where slug in ('hotel-lumen', 'albora-hotel-spa')",
  );
  check(
    "Datos",
    "Sin los hoteles de la demo",
    demoHotels.n === 0,
    `${demoHotels.n} hoteles de la demo`,
  );

  const active = "t.status in ('trial', 'active')";
  const testPay = await one(
    `select count(*)::int n from public.payment_accounts p join public.tenants t on t.id = p.tenant_id where ${active} and p.active and p.test_mode`,
  );
  check(
    "Hoteles",
    "Pasarelas en modo real",
    testPay.n === 0,
    `${testPay.n} pasarelas activas en modo de pruebas`,
    "warn",
  );
  const ses = await one(
    `select count(*)::int n from public.ses_settings s join public.tenants t on t.id = s.tenant_id where ${active} and s.environment <> 'prod'`,
  );
  check(
    "Hoteles",
    "SES.HOSPEDAJES en producción",
    ses.n === 0,
    `${ses.n} hoteles con envío simulado o de pruebas`,
    "warn",
  );
  const fiscal = await one(
    `select count(*)::int n from public.fiscal_settings f join public.tenants t on t.id = f.tenant_id where ${active} and f.environment <> 'prod'`,
  );
  check(
    "Hoteles",
    "VERI*FACTU en producción",
    fiscal.n === 0,
    `${fiscal.n} hoteles con facturación simulada o de pruebas`,
    "warn",
  );
  const noAdmin = await one(
    `select count(*)::int n from public.tenants t where ${active} and not exists (select 1 from public.tenant_members m where m.tenant_id = t.id and m.role = 'admin')`,
  );
  check(
    "Hoteles",
    "Cada hotel tiene dirección",
    noAdmin.n === 0,
    `${noAdmin.n} hoteles sin nadie de dirección`,
  );
} finally {
  await db.query("rollback");
  await db.end();
}

// --- Report ---------------------------------------------------------------
let area = "";
for (const r of results) {
  if (r.area !== area) console.log(`\n${(area = r.area)}`);
  const mark = r.ok ? "✓" : r.level === "block" ? "✗" : "!";
  console.log(`  ${mark} ${r.what}${r.ok || !r.detail ? "" : ` (${r.detail})`}`);
}
const blocking = results.filter((r) => !r.ok && r.level === "block").length;
const warnings = results.filter((r) => !r.ok && r.level === "warn").length;
console.log(`\n${blocking} bloqueantes, ${warnings} avisos (proyecto ${ref}).`);
process.exit(blocking ? 1 : 0);
