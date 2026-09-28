# Despliegue

Melend/OS tiene dos piezas que se despliegan por separado:

| Pieza                                                                     | Qué es                                   | Dónde                                                                 |
| ------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| **Frontend** (panel `/today`, web de reservas `/web`, widget `/embed/*`)  | SPA estática (`npm run build` → `dist/`) | Cualquier hosting estático con dominios propios (Vercel, Cloudflare…) |
| **Backend** (base de datos, reglas, Edge Functions, cron, almacenamiento) | Un proyecto Supabase por entorno         | Supabase                                                              |

No hay backend simulado: el frontend siempre habla con un proyecto Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).

## Entornos

| Entorno                    | Proyecto Supabase                 | Cómo se actualiza                                                  |
| -------------------------- | --------------------------------- | ------------------------------------------------------------------ |
| **Demo = preproducción**   | `isqompyvktijdasgophh`            | Automático en cada merge a `main` (`.github/workflows/deploy.yml`) |
| **Producción** (por crear) | Uno nuevo, plan de pago, con PITR | Manual con aprobación: se promociona lo que ya pasó por la demo    |

Reglas:

- Todo se prueba antes en la demo: tests de base de datos (`npm run test:db`), `scripts/e2e-*.mjs` y navegador.
- **La sesión global de la CLI de Supabase en el PC de Dan es producción del cliente antiguo.** Antes de cualquier comando `supabase`: `set -a; . ./.env; set +a`. Nunca `supabase link` ni `deploy` sin haber cargado el `.env` del entorno correcto.
- Lo que cambia entre demo y producción es configuración (variables y secretos), nunca código.

## Frontend

```bash
npm ci
npm run build          # dist/ (con _redirects para las rutas de la SPA)
```

Variables de build:

| Variable                        | Demo                           | Producción                              |
| ------------------------------- | ------------------------------ | --------------------------------------- |
| `VITE_SUPABASE_URL`             | proyecto de la demo            | proyecto de producción                  |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | clave publicable de la demo    | clave publicable de producción          |
| `VITE_DEMO_ACCESS`              | `true` (login por desplegable) | **sin definir** (login con contraseña)  |
| `VITE_PLATFORM_DOMAIN`          | vacío (selector de hoteles)    | p. ej. `reservas.melendo.app`           |
| `VITE_PLATFORM_CNAME`           | vacío                          | destino del CNAME que crean los hoteles |

Dominios (ver `docs/web-y-dominio.md`):

- `*.reservas.melendo.app` → hosting del frontend (registro DNS comodín y certificado comodín). Cada hotel responde en `<slug>.reservas.melendo.app`.
- Dominio propio del hotel (`reservas.suhotel.com`): el hotel crea un CNAME a `VITE_PLATFORM_CNAME` y **el hosting tiene que emitir el certificado de ese dominio**. En Vercel se añade cada dominio al proyecto (API de dominios); en Cloudflare, con «Cloudflare for SaaS» (custom hostnames). **Pendiente de elegir** antes del primer hotel con dominio propio.
- El widget (`embed.js`) se sirve desde el mismo frontend; la web del hotel lo carga desde su subdominio.

## Backend (Supabase)

`deploy.yml` hace, en cada merge a `main` y contra la demo:

1. `supabase db push` (migraciones de `supabase/migrations/`).
2. `supabase functions deploy` (todas las funciones de `supabase/functions/`).

Secretos de GitHub del repositorio: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL` (tests de BD y lake), `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (lake y keep-alive), `SALES_SUPABASE_URL`, `SALES_SUPABASE_KEY` (keep-alive del proyecto de ventas).

### Secretos de las Edge Functions (`supabase secrets set …`)

| Secreto                                             | Para qué                                                                          | Demo             | Producción                       |
| --------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------- | -------------------------------- |
| `DEMO_ACCESS`                                       | Habilita `demo-login` y el cambio de módulos desde el panel                       | `true`           | **nunca**                        |
| `PUBLIC_WEB_URL`                                    | Enlaces al huésped cuando el hotel no tiene dominio propio                        | URL de la demo   | opcional                         |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`          | Asistente de reservas y copiloto (cualquier API compatible con OpenAI)            | Ollama por túnel | proveedor de API                 |
| `RESEND_API_KEY`, `EMAIL_FROM`                      | Emails al huésped. Sin ellos, los emails quedan como «simulados»                  | sin definir      | obligatorio (dominio verificado) |
| `GUEST_EMAILS_CRON_KEY`                             | Llamada programada a `guest-emails-dispatch` (lo pone `scripts/emails-setup.mjs`) | puesto           | puesto                           |
| `CHANNELS_CRON_KEY`                                 | Envío programado de disponibilidad a los canales (`scripts/channels-setup.mjs`)   | puesto           | puesto                           |
| `SES_CRON_KEY`                                      | Envío programado a SES.HOSPEDAJES (`scripts/ses-setup.mjs`)                       | puesto           | puesto                           |
| `VERIFACTU_CRON_KEY`                                | Envío programado a VERI\*FACTU (`scripts/verifactu-setup.mjs`)                    | puesto           | puesto                           |
| `VERIFACTU_PRODUCER_NAME`, `VERIFACTU_PRODUCER_NIF` | Productor del sistema de facturación (obligatorio fuera del entorno simulado)     | —                | razón social y NIF               |

Por hotel (nunca en variables globales): credenciales de la pasarela de pago, de SES.HOSPEDAJES, el certificado de VERI\*FACTU y el secreto de cada canal van a **Vault** desde el panel o con sus funciones (`upsert_payment_secret`, `save_ses_credentials`, `save_verifactu_certificate`, `create_channel`).

### Autenticación (panel de Supabase → Authentication)

- **URL Configuration**: _Site URL_ = el dominio del panel, y en _Redirect URLs_ las páginas a las que vuelven los enlaces de recuperación e invitación: `https://*.reservas.melendo.app/reset-password` y los dominios propios de los hoteles, o sus comodines. Sin esto, el enlace de «¿Has olvidado la contraseña?» no vuelve a la app.
- **SMTP propio** (Resend, con el dominio de envío verificado): el SMTP incluido en Supabase solo envía unos pocos emails por hora y no sirve para producción.
- Registro público desactivado: las cuentas del personal las crea el alta del hotel o una invitación.

### Una vez por proyecto

```bash
set -a; . ./.env; set +a        # el .env del entorno que toca
npx supabase db push --db-url "$SUPABASE_DB_URL"
npx supabase functions deploy --project-ref "$SUPABASE_PROJECT_REF" --use-api
node scripts/ses-setup.mjs       # cron + clave de SES.HOSPEDAJES
node scripts/verifactu-setup.mjs # cron + clave de VERI*FACTU
node scripts/emails-setup.mjs    # cron + clave de los emails al huésped
node scripts/channels-setup.mjs  # cron + clave del envío a los canales
```

Solo en la demo: `node --env-file=.env scripts/seed-auth.mjs` (cuentas ficticias), `scripts/simulate-history.ts` (historial) y las semillas de `supabase/seeds/` con `scripts/sql-apply.mjs`.

## Promoción a producción (por montar con el primer hotel)

Propuesta:

1. Workflow `promote.yml`, lanzado a mano y con un **environment de GitHub `production` con aprobación obligatoria**.
2. Usa los secretos del environment de producción (proyecto, contraseña y token de una cuenta que solo vea ese proyecto).
3. Ejecuta `db push` y `functions deploy` desde el mismo commit que ya está en la demo, y después un humo mínimo (`scripts/e2e-bookings.mjs` contra un hotel de pruebas de producción).
4. Frontend: el hosting publica la rama `main` (o una etiqueta) con las variables de producción.

Antes de abrir producción: copias con PITR, alertas de errores de las funciones y de la cola de envíos (SES, VERI\*FACTU, emails), y un simulacro de restauración.

## Tareas programadas

| Qué                                       | Dónde                                                               | Frecuencia       |
| ----------------------------------------- | ------------------------------------------------------------------- | ---------------- |
| Envíos SES, VERI\*FACTU, emails y canales | `pg_cron` en la base (`*_tick`)                                     | cada minuto      |
| Alertas de operación (colas, IA)          | GitHub Actions `ops-alerts.yml` → incidencia «Alertas de operación» | cada hora        |
| Reservas sin pagar, códigos caducados     | `pg_cron`                                                           | 15 min / diario  |
| Exportación al data lake                  | GitHub Actions `lake.yml`                                           | diario 03:15 UTC |
| Keep-alive de los proyectos gratuitos     | GitHub Actions `keepalive.yml`                                      | cada 3 días      |

## Web comercial (`site/`)

Proyecto aparte con su CI (`site.yml`), desplegado en Vercel con raíz `site/` y su propio Supabase de ventas. Ver `site/README.md`.
