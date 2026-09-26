# Mapa del proyecto

Guía rápida para orientarse sin recorrer el repo. Si añades o mueves una pieza,
actualiza este archivo. Decisiones y su porqué: `CLAUDE.md` (local).
Tareas pendientes de Dan: `Cambiospendientes.md` (local; márcalas `- [x]` con el PR).

## Qué es

PMS y motor de reservas SaaS multi-hotel (hoteles por noches): web pública de
reservas (`/web`), app del huésped (`/stays`), panel de gestión (`/_app`) y capa
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

| Qué                                                    | Comando                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Arrancar                                               | `npm run dev`                                                                                     |
| Typecheck / lint / tests / build                       | `npm run typecheck` · `npm run lint` · `npm test` · `npm run build`                               |
| Tests de base de datos (RLS, permisos, paridad SQL↔TS) | `npm run test:db`                                                                                 |
| Evals del agente y del copiloto (modelo real)          | `npm run eval:agent` · `npm run eval:copilot` (`EVAL_MODEL=stays-agent-7b`)                       |
| Probar SQL sin aplicarlo (rollback)                    | `node --env-file=.env scripts/sql-dry-run.mjs <archivo.sql>`                                      |
| Aplicar un SQL suelto a la demo (semillas)             | `node --env-file=.env scripts/sql-apply.mjs <archivo.sql>`                                        |
| Aplicar migraciones a la demo                          | `npx supabase db push --db-url "$SUPABASE_DB_URL"` (con el `.env` cargado)                        |
| Desplegar una función a la demo                        | `npx supabase functions deploy <fn> --project-ref isqompyvktijdasgophh --use-api`                 |
| Regenerar tipos de la base                             | `npx supabase gen types typescript --linked --schema public > src/integrations/supabase/types.ts` |
| Cuentas de demo                                        | `node --env-file=.env scripts/seed-auth.mjs`                                                      |
| E2E contra la demo                                     | `node --env-file=.env scripts/e2e-{bookings,payments,folio,mcp,channels}.mjs`                     |
| Web comercial (aparte)                                 | `cd site && npm run dev` · `npm run check` (ver `site/README.md`)                                 |
| LLM local (Ollama)                                     | `node --env-file=.env scripts/llm-gateway.mjs` + túnel cloudflared (ver CLAUDE.md)                |

Flujo: rama desde `main` → PR → CI en verde → squash merge (permisos ya concedidos).

## Carpetas

```
src/                                Frontend (TanStack Start/Router, React 19, Tailwind v4, shadcn, TanStack Query)
  routes/_app.*.tsx                 Panel: today, calendar, reservations, customers, messages, reports, reviews,
                                    rooms, rates, extras, promos, channels, integrations (MCP), plan (módulos)
  routes/web.*.tsx                  Web pública: hoteles, habitación, reservar, checkout, mi-reserva, chat, firma
  routes/stays.*.tsx                App del huésped: descubrir, reservar, viajes, club, cuenta, chat
  components/                       UI compartida (AppSidebar, CopilotWidget, AgentChat, CustomerDrawer,
                                    FolioDrawer, DateRangePicker con precios, NewReservationDialog…)
  lib/                              Hooks y datos: roles (isAdmin/isGroup/canOperate), features (módulos),
                                    reports, customers, channels, chat, folio, mcp, demo-access, stays…
  integrations/supabase/            Cliente único + types.ts generados
  integrations/pms/                 PmsConnector (contrato app del huésped ↔ PMS) + implementación
  integrations/cms/                 Experiencias (tabla experiences)
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
site/                               Web comercial (landing, precios y SLA, agendar demo). Proyecto aparte: su
                                    package.json, su CI y su Supabase de ventas (leads). No importa la app.
```

## Dónde está cada cosa

| Tema                                          | Dónde                                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Multi-tenant y roles                          | `tenant_members` (`admin`, `reception`, `group`), `is_tenant_member`, `has_tenant_role` (admin incluye group), trigger `forbid_group_operations` |
| Precio de una estancia                        | `@domain/pricing.ts` (`priceStay`) ← `tools/bookings.ts` (`quoteStay`, `createBookingDraft`)                                                     |
| Pagos y cancelación                           | `@domain/policies.ts`, SQL `cancel_booking_as_guest`, `payments-*`; pago online o en el hotel, sin señal                                         |
| Motivos de cancelación                        | `@domain/cancellations.ts` + `reservations.cancellation_category/note`                                                                           |
| Módulos y paquetes por hotel                  | `@domain/features.ts` + SQL `tenant_feature()`; panel «Plan y módulos»                                                                           |
| Estancia: chat, cuenta, ampliaciones, reseñas | `stay_messages`, `folio_charges`, `stay_extensions`, `reviews` (migraciones 202609261\*)                                                         |
| Clientes y datos sensibles                    | `customer_directory()`, `guest_identities` (+ `get/save_guest_identity`, reautenticación ≤10 min), `delete_customer()`                           |
| Agente de reservas (web)                      | `agent-chat` + `_shared/agent` + `tools/registry.ts`; cancela con `cancel_booking` en dos pasos                                                  |
| Copiloto (panel)                              | `admin-copilot` + `_shared/copilot`; widget `CopilotWidget`                                                                                      |
| Servidor MCP                                  | `mcp` + `_shared/mcp`; tokens `mcp_tokens`; `docs/mcp.md`                                                                                        |
| OTAs y touroperadores                         | `channel-webhook`, `channels-dispatch`, `_shared/channels`, tablas `channels*`; `docs/channels.md`                                               |
| Informes                                      | `report_stays()` (SQL, solo datos) → `@domain/kpis.ts` → `routes/_app.reports.tsx`                                                               |
| Calendario con precios                        | `tools/calendar.ts` → función `price-calendar` → `DateRangePicker`                                                                               |
| Acceso demo                                   | `_shared/demo/accounts.ts`, función `demo-login`, `VITE_DEMO_ACCESS`                                                                             |
| Precios, SLA y leads (web comercial)          | `site/supabase/functions/_shared/plans.ts`, `site/PRICING.md`, función `leads` (Supabase de ventas)                                              |
| Data lake                                     | `lake/export.py` (lista blanca de columnas), `lake_tenants()`                                                                                    |

## Convenciones

- El hotel (tenant) lo fija siempre el servidor, nunca el cliente ni el modelo.
- Reglas de negocio en `@domain` (TS); si la base las necesita, espejo SQL con test de paridad.
- Textos de la interfaz en español; código, comentarios y commits en inglés.
- Nada irreversible sin confirmación humana (del hotel, o del huésped en lo que puede hacer él).
- Cambios en el lake: actualizar `lake/README.md` (contrato con Mercedes).
- Al terminar una tarea: tests, `npm run check`, PR, y anotar la decisión en `CLAUDE.md`.
