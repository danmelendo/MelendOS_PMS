# Arquitectura

Plataforma SaaS multi-hotel: web pública de reservas, app del huésped, panel de gestión (PMS) y
una capa de IA (agente de reservas, servidor MCP). Un solo código para todos los hoteles; lo que
cambia entre hoteles y entre entornos es configuración.

## Entornos

| Entorno                    | Qué es                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| **Demo / preproducción**   | Proyecto Supabase de la demo, con datos ficticios. Recibe cada merge a `main` (CD).                |
| **Producción** (pendiente) | Proyecto Supabase propio. Se promociona desde preproducción cuando un cambio ya se ha probado ahí. |

No hay backend simulado en el navegador: la app siempre habla con un proyecto Supabase real
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`). El acceso por desplegable de cuentas
ficticias (`VITE_DEMO_ACCESS` + secreto `DEMO_ACCESS`) solo existe en la demo.

## Piezas

```
src/                         Frontend (TanStack Start/Router, React 19, Tailwind v4, TanStack Query)
  routes/                    /web (web pública), /stays (app del huésped), /_app (panel)
  integrations/supabase/     Cliente único de datos
  integrations/pms/          Contrato PmsConnector (la app del huésped habla con el PMS solo por aquí)
  integrations/cms/          Contrato CmsClient (experiencias)
supabase/
  migrations/                Esquema: tenant_id + RLS en todas las tablas, funciones y triggers
  functions/                 Edge Functions (Deno): reservas, pagos, ampliaciones, agente, MCP…
  functions/_shared/domain/  Reglas de negocio en TS puro (precios, fechas, KPIs, políticas, módulos)
  functions/_shared/tools/   Herramientas del dominio (Zod) para el agente, el MCP y las funciones
  functions/_shared/agent/   Bucle del agente, prompt y cliente compatible con OpenAI
  functions/_shared/mcp/     Servidor MCP sobre las mismas herramientas
  tests/                     Tests contra Postgres (RLS, permisos, paridad SQL↔TS)
  evals/                     Evaluaciones del agente contra un modelo real
lake/                        Exportación diaria a Parquet (Python + DuckDB) para análisis y ML
scripts/                     Pruebas de extremo a extremo, simulador de historial, utilidades
```

## Decisiones que sostienen el diseño

- **El tenant es el núcleo.** Cada fila lleva `tenant_id` y RLS lo aplica; las Edge Functions que
  usan la clave de servicio filtran siempre por el tenant que resuelve el servidor, nunca por lo
  que envía el cliente o el modelo.
- **Dominio compartido.** `@domain` (TS sin dependencias) lo importan el frontend, las Edge
  Functions y los tests. Donde la base de datos también necesita la regla (políticas, módulos),
  hay un espejo SQL con test de paridad.
- **Herramientas tipadas, una sola vez.** Las herramientas de `_shared/tools` sirven al agente
  de la web, al servidor MCP y al calendario de precios. El modelo nunca toca la base de datos.
- **Nada irreversible sin una persona.** Las reservas online quedan pendientes hasta el pago
  verificado por la pasarela; las cancelaciones fuera de plazo y las ampliaciones las decide
  recepción.
- **Pasarela por hotel.** Interfaz común (Redsys primero), credenciales cifradas en Vault.
- **Paquetes y módulos.** Base + paquetes (Estancia, IA, Cadena, Datos) por hotel, comprobados en
  el servidor ([`features.ts`](supabase/functions/_shared/domain/features.ts)).
- **Medir para repercutir costes.** Eventos de negocio (`domain_events`), uso por hotel
  (`usage_events`, `agent_runs`) y almacenamiento del lake por prefijo de tenant.

## Calidad

- CI en cada PR: typecheck, lint, tests unitarios, build, tests de base de datos y tests del lake.
- CD en cada merge a `main`: migraciones y Edge Functions a la demo / preproducción.
- Pruebas de extremo a extremo contra la demo: `scripts/e2e-*.mjs`.
- Evals del agente: `npm run eval:agent`.
