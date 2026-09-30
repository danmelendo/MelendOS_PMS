# Mapa del proyecto

Guía rápida para orientarse sin recorrer el repo. Si añades o mueves una pieza,
actualiza este archivo. Decisiones y su porqué: `CLAUDE.md` (local).
Tareas pendientes de Dan: `Cambiospendientes.md` (local; márcalas `- [x]` con el PR).

## Qué es

PMS y motor de reservas SaaS multi-hotel (hoteles por noches): web pública de
reservas (`/web`, o incrustada en la web del hotel con `embed.js`), panel de gestión (`/_app`) y capa
de IA (agente de reservas, copiloto, servidor MCP). Un solo código; lo que cambia
entre hoteles y entornos es configuración. Dos hoteles ficticios en la demo:
**Hotel Lumen** (Valencia, starter, sin club) y **Albora Hotel & Spa** (Altea, pro).

## Entornos y precauciones

- **Demo = preproducción**: proyecto Supabase `isqompyvktijdasgophh`. Cada merge a
  `main` despliega migraciones y Edge Functions (`.github/workflows/deploy.yml`).
- **La sesión global de la CLI de Supabase en esta máquina es PRODUCCIÓN.** Antes de
  cualquier comando `supabase`: `set -a; . ./.env; set +a` (usa el token de la demo).
  Nunca enlazar ni desplegar contra producción.
- Los tests de base de datos de la CI corren **contra la base de la demo** (en cada PR
  y tras cada merge a `main`): no apliques migraciones ni ejecutes `seed-auth` a la vez.
- Sin mock: la app siempre usa un proyecto Supabase (`VITE_SUPABASE_*` en `.env`).
- Nada de datos ni nombres reales del cliente en el repo. Secretos solo en `.env` y Vault.

## Comandos

| Qué                                                    | Comando                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ---------- |
| Arrancar                                               | `npm run dev`                                                                                                |
| Typecheck / lint / tests / build                       | `npm run typecheck` · `npm run lint` · `npm test` · `npm run build`                                          |
| Tests de base de datos (RLS, permisos, paridad SQL↔TS) | `npm run test:db`                                                                                            |
| Evals del agente y del copiloto (modelo real)          | `npm run eval:agent` · `npm run eval:copilot` (`EVAL_MODEL=stays-agent-7b`)                                  |
| Probar SQL sin aplicarlo (rollback)                    | `node --env-file=.env scripts/sql-dry-run.mjs <archivo.sql>`                                                 |
| Aplicar un SQL suelto a la demo (semillas)             | `node --env-file=.env scripts/sql-apply.mjs <archivo.sql>`                                                   |
| Aplicar migraciones a la demo                          | `npx supabase db push --db-url "$SUPABASE_DB_URL"` (con el `.env` cargado)                                   |
| Desplegar una función a la demo                        | `npx supabase functions deploy <fn> --project-ref isqompyvktijdasgophh --use-api`                            |
| Regenerar tipos de la base                             | `npx supabase gen types typescript --linked --schema public > src/integrations/supabase/types.ts`            |
| Alta de un hotel (plataforma)                          | `node --env-file=.env scripts/create-hotel.ts hotel.json [--apply --app-url <panel>]`                        |
| Importar reservas anteriores (plataforma)              | `node --env-file=.env scripts/import-reservations.ts <slug> reservas.csv [--apply]`                          |
| Dar o quitar el rol de soporte «Administrador»         | `node --env-file=.env scripts/platform-admin.mjs <email> [--remove] [--note texto]` · `--list`               |
| Cuentas de demo                                        | `node --env-file=.env scripts/seed-auth.mjs`                                                                 |
| Ciclo natural de 10 reservas (demo en vivo)            | `node --env-file=.env scripts/demo-cycle.mjs [--keep                                                         | --remove]` |
| E2E contra la demo                                     | `node --env-file=.env scripts/e2e-{bookings,payments,folio,mcp,channels,ses,verifactu,promo-emails,mfa}.mjs` |
| Web comercial (aparte)                                 | `cd site && npm run dev` · `npm run check` (ver `site/README.md`)                                            |
| LLM local (Ollama)                                     | `node --env-file=.env scripts/llm-gateway.mjs` + túnel cloudflared (ver CLAUDE.md)                           |

Flujo: rama desde `main` → PR → CI en verde → squash merge (permisos ya concedidos).

## Carpetas

```
src/                                Frontend (TanStack Start/Router, React 19, Tailwind v4, shadcn, TanStack Query)
  routes/_app.*.tsx                 Panel: today, calendar, reservations, customers, messages, reports, reviews,
                                    rooms, rates, extras, promos, channels, integrations (MCP), plan (módulos), team, activity, account,
                                    travellers (registro de viajeros SES.HOSPEDAJES), invoices (VERI*FACTU)
                                    Menú por rol: Operativa (todos), Gestión y Configuración (dirección;
                                    settings.invoicing / settings.travellers), Administrar y configuración
                                    (solo soporte Melend/OS: plan, canales, IA, journal, actividad).
                                    Guardas de página en components/settings/AdminOnly.tsx
  routes/web.*.tsx                  Web pública: hoteles, habitación, reservar, checkout, mi-reserva, chat, firma
  routes/embed.*.tsx                Widget incrustable (búsqueda y asistente) que carga public/embed.js
  components/                       UI compartida (AppSidebar, CopilotWidget, AgentChat, CustomerDrawer,
                                    FolioDrawer, DateRangePicker con precios, NewReservationDialog…)
  lib/                              Hooks y datos: roles (isAdmin/isGroup/canOperate), features (módulos),
                                    reports, customers, channels, chat, folio, mcp, demo-access, stays…
  integrations/supabase/            Cliente único + types.ts generados
  integrations/pms/                 PmsConnector (contrato web de reservas ↔ PMS) + implementación
supabase/
  migrations/                       Esquema (tenant_id + RLS en todo), funciones SQL, triggers. Una por cambio.
  seeds/                            Datos demo aplicables con sql-apply (políticas, paquetes, servicios, identidades)
  functions/<fn>/index.ts           Edge Functions (Deno): bookings-create, payments-create/notify, stays-extend,
                                    agent-chat, admin-copilot, mcp, price-calendar, tenant-modules, demo-login,
                                    channel-webhook, channels-dispatch, channel-simulate
  functions/_shared/domain/         Reglas en TS puro, alias @domain: precios, fechas, KPIs, políticas de pago y
                                    cancelación, módulos y paquetes, motivos de cancelación, reseñas
  functions/_shared/tools/          Herramientas tipadas (Zod) del agente y el MCP (registry.ts), reservas
                                    (bookings.ts), calendario de precios, ampliaciones, store Supabase y fake
  functions/_shared/agent/          Bucle del agente (loop.ts: barreras), prompt, cliente LLM compatible OpenAI
  functions/_shared/copilot/        Herramientas de solo lectura del copiloto + prompt
  functions/_shared/mcp/            Servidor MCP (SDK oficial) y tokens
  functions/_shared/channels/       OTAs/touroperadores: contrato, entrada, salida (ARI), adaptadores
  functions/_shared/payments/       Pasarelas (Redsys, Stripe) por hotel
  functions/_shared/sim/            Simulador de historial ficticio
  tests/                            rls.test.ts (permisos y reglas contra Postgres), tools.test.ts
  evals/                            Evals del agente y el copiloto (resultados en results/, ignorado)
lake/                               Exportación diaria a Parquet (Python + DuckDB); contrato con Mercedes en README
scripts/                            E2E, simulador, seed-auth, sql-apply/dry-run, gateway LLM
docs/                               mcp.md (conectar asistentes), channels.md (contrato de canales)
site/                               Web comercial de Melend/OS (landing, hostales, normativa, precios y SLA,
                                    agendar demo), prerenderizada para SEO; Vercel con raíz site/. Proyecto
                                    aparte: su package.json, su CI y su Supabase de ventas (leads).
```

## Dónde está cada cosa

| Tema                                          | Dónde                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-tenant y roles                          | `tenant_members` (`admin`, `reception`, `group`, `platform`), `is_tenant_member`, `has_tenant_role` (admin incluye group; platform vale para todo), trigger `forbid_group_operations`; soporte de Melend/OS: `platform_admins` + `scripts/platform-admin.mjs`                                                                                                           |
| Precio de una estancia                        | `@domain/pricing.ts` (`priceStay`) ← `tools/bookings.ts` (`quoteStay`, `createBookingDraft`)                                                                                                                                                                                                                                                                            |
| Cobros y TPV (por hotel)                      | Panel «Cobros y TPV» (`_app.payments.tsx`), `save_payment_account()`/`payment_account_status()`, `payment_accounts` + Vault; pago incrustado: `PaymentModal` en el checkout                                                                                                                                                                                             |
| Pagos y cancelación                           | `@domain/policies.ts`, SQL `cancel_booking_as_guest`, `payments-*`; pago online o en el hotel, sin señal                                                                                                                                                                                                                                                                |
| Motivos de cancelación                        | `@domain/cancellations.ts` + `reservations.cancellation_category/note`                                                                                                                                                                                                                                                                                                  |
| Módulos y paquetes por hotel                  | `@domain/features.ts` + SQL `tenant_feature()`; panel «Plan y módulos»                                                                                                                                                                                                                                                                                                  |
| Estancia: chat, cuenta, ampliaciones, reseñas | `stay_messages`, `folio_charges`, `stay_extensions`, `reviews` (migraciones 202609261\*)                                                                                                                                                                                                                                                                                |
| Clientes y datos sensibles                    | `customer_directory()`, `guest_identities` (+ `get/save_guest_identity`, reautenticación ≤10 min), `delete_customer()`                                                                                                                                                                                                                                                  |
| Agente de reservas (web)                      | `agent-chat` + `_shared/agent` + `tools/registry.ts`; cancela con `cancel_booking` en dos pasos                                                                                                                                                                                                                                                                         |
| Copiloto (panel)                              | `admin-copilot` + `_shared/copilot`; widget `CopilotWidget`                                                                                                                                                                                                                                                                                                             |
| Servidor MCP                                  | `mcp` + `_shared/mcp`; tokens `mcp_tokens`; `docs/mcp.md`                                                                                                                                                                                                                                                                                                               |
| Registro de viajeros (SES.HOSPEDAJES)         | `@domain/ses.ts` + `_shared/ses` (XML, ZIP, SOAP) + `ses-dispatch`; tablas `ses_*`, `stay_travellers`; `docs/ses-hospedajes.md`                                                                                                                                                                                                                                         |
| Facturación VERI\*FACTU                       | `@domain/invoicing.ts` (IVA), `_shared/verifactu` (huella, XML, envío) + `verifactu-dispatch`; tablas `tax_invoices`, `verifactu_records`, `fiscal_settings`; `docs/verifactu.md`                                                                                                                                                                                       |
| OTAs y touroperadores                         | `channel-webhook`, `channels-dispatch`, `_shared/channels`, tablas `channels*`; `docs/channels.md`                                                                                                                                                                                                                                                                      |
| Informes                                      | `report_stays()` (SQL, solo datos) → `@domain/kpis.ts` → `routes/_app.reports.tsx`                                                                                                                                                                                                                                                                                      |
| Ofertas en la web (rebajas y códigos)         | `hotel_offers()` (reglas de fecha en negativo + `promo_codes.published`), `HotelOffers.tsx`; canje en el motor (`validate_/claim_promo_code`)                                                                                                                                                                                                                           |
| Check-in online (registro de viajeros)        | `/web/checkin/$id` → `guest_save_traveller`/`guest_list_travellers` (misma escritura que recepción: `stay_traveller_write`) → firma `/web/sign`                                                                                                                                                                                                                         |
| Equipo (personal del hotel)                   | `routes/_app.team.tsx`, `list_staff()`, función `staff-invite`, trigger `guard_staff_changes`                                                                                                                                                                                                                                                                           |
| Páginas legales de la web del hotel           | `routes/web.legal.$page.tsx`, `src/lib/legal-texts.ts`, `hotel_legal()`                                                                                                                                                                                                                                                                                                 |
| Verificación en dos pasos (personal)          | `staff_mfa_ok()` en las funciones de permisos, `verifiedUser()` en `_shared/http.ts`, `src/lib/mfa.ts`, `/account`, `MfaCodeForm`                                                                                                                                                                                                                                       |
| Alta de un hotel                              | `scripts/create-hotel.ts` + `_shared/onboarding/hotel.ts`, `scripts/hotel.example.json`, `docs/alta-hotel.md`; reservas anteriores: `scripts/import-reservations.ts`                                                                                                                                                                                                    |
| Actividad y consumo (observabilidad)          | `hotel_activity()`, `routes/_app.activity.tsx`, `src/lib/activity.ts`                                                                                                                                                                                                                                                                                                   |
| Alertas de operación (plataforma)             | aviso al hotel en «Hoy»: `hotel_alerts()` + `HotelAlerts`; plataforma: `ops_alerts()`, `scripts/ops-alerts.mjs`, `.github/workflows/ops-alerts.yml` (incidencia en GitHub)                                                                                                                                                                                              |
| Idiomas (web del huésped, panel, emails)      | `src/lib/i18n.ts` (`t()`, ámbito web/panel) + diccionarios `i18n-en.ts` (huésped) e `i18n-panel-en.ts` (panel, selector ES/EN en la cabecera), `legal-texts-en.ts`, `reservations.guest_lang`, plantilla de `_shared/email/templates.ts`                                                                                                                                |
| Devoluciones                                  | `payments-refund`, `PaymentGateway.refund()` (Redsys REST, Stripe), `record_payment_refund()`, `refundable_payments()`, `RefundCard` en el editor de reservas; pendientes en «Hoy»: `pending_refunds()`, `record_external_refund()`, `PendingRefunds`                                                                                                                   |
| Paso a producción                             | `.github/workflows/promote.yml` (con aprobación), `scripts/prod-check.mjs` (preparado para producción), `scripts/smoke.mjs` (humo, también en las alertas horarias), `docs/pasar-a-produccion.md`                                                                                                                                                                       |
| Instalación en VPS                            | Plan: `docs/instalacion-vps.md`; primera instalación a mano: `docs/vps-bitacora.md`; piezas: `deploy/vps/` (`instance/` override del compose oficial de Supabase y enrutador de funciones, `proxy/` Caddy compartido, `tools/cron-setup.mjs`); actualizaciones: `docs/vps-actualizaciones.md` (flujos `release.yml` y `vps-publish.yml`, comando `deploy/vps/melendos`) |
| Estado del producto y despliegue              | `docs/estado-producto.md`, `DEPLOY.md`                                                                                                                                                                                                                                                                                                                                  |
| Emails al huésped                             | Cola `guest_emails` (trigger en reservas) → `guest-emails-dispatch` (Resend con `RESEND_API_KEY` + `EMAIL_FROM`, si no simulado) · `_shared/email`; `scripts/emails-setup.mjs`                                                                                                                                                                                          |
| Calendario con precios                        | `tools/calendar.ts` → función `price-calendar` → `DateRangePicker`                                                                                                                                                                                                                                                                                                      |
| Web y dominio del hotel                       | `tenants.brand`/`domain`, `save_hotel_web()`, `src/lib/hotel-web.ts` (resolución por host), `brand.tsx`, Admin → «Web y dominio»; `docs/web-y-dominio.md`                                                                                                                                                                                                               |
| Acceso demo                                   | `_shared/demo/accounts.ts`, función `demo-login`, `VITE_DEMO_ACCESS`                                                                                                                                                                                                                                                                                                    |
| Precios, SLA y leads (web comercial)          | `site/supabase/functions/_shared/plans.ts`, `site/PRICING.md`, función `leads` (Supabase de ventas); panel `/admin/` (leads, clientes, facturación): `site/src/pages/Admin*.tsx`, migración `20260929120000_clients.sql`                                                                                                                                                |
| Formulario de alta (clientes nuevos)          | Supabase de ventas: `client_onboarding*`, función `onboarding`, página `site/src/pages/Onboarding.tsx` (`/alta/`), panel `AdminOnboarding.tsx`, reglas en `site/supabase/functions/_shared/onboarding.ts`, `site/scripts/onboarding-setup.mjs`                                                                                                                          |
| Data lake                                     | `lake/export.py` (lista blanca de columnas), `lake_tenants()`                                                                                                                                                                                                                                                                                                           |

## Convenciones

- El hotel (tenant) lo fija siempre el servidor, nunca el cliente ni el modelo.
- Reglas de negocio en `@domain` (TS); si la base las necesita, espejo SQL con test de paridad.
- Textos de la interfaz en español; código, comentarios y commits en inglés.
- Nada irreversible sin confirmación humana (del hotel, o del huésped en lo que puede hacer él).
- Cambios en el lake: actualizar `lake/README.md` (contrato con Mercedes).
- Al terminar una tarea: tests, `npm run check`, PR, y anotar la decisión en `CLAUDE.md`.
