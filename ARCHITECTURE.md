# Arquitectura e ingeniería

> **Por qué existe este documento.** Lo que se ejecuta al abrir la demo es la **punta visible**
> de un sistema en producción. El esfuerzo de ingeniería real —pagos regulados, seguridad de
> datos por filas, flujos de pago asíncronos, modelo de dominio de precios— vive en capas que
> el navegador **no necesita** para enseñar la aplicación. Como la demo sustituye ese backend
> por un mock, aquí se describe lo que se reemplazó y por qué es la parte cara.
>
> Resumen honesto: la demo prioriza que cualquiera vea la arquitectura y el flujo **sin instalar
> nada**. No es una medida del trabajo que hay detrás.

---

## 1. La demo esconde la parte cara (qué sustituye y qué cuesta de verdad)

| Componente real (producción)                    | En esta demo              | Complejidad | Por qué cuesta                                                 |
| ----------------------------------------------- | ------------------------- | ----------- | -------------------------------------------------------------- |
| Firma **Redsys/TPV** server-side + webhook      | Pago simulado, no-op      | **Alta**    | Específica de España, regulada; criptografía + flujo asíncrono |
| **Políticas RLS** por rol en Postgres           | Mock sin auth real        | **Alta**    | Es seguridad de datos, no `if (isAdmin)` en el cliente         |
| **Edge Functions** (Deno) + gestión de secretos | No-op / mock en navegador | Media-alta  | La clave secreta nunca toca el navegador                       |
| Esquema **Postgres** + migraciones (12 tablas)  | Dataset en `localStorage` | Media       | Modelo de dominio real, relaciones, enums                      |
| **Realtime** (nuevas reservas)                  | Canal simulado            | Media       | Suscripciones servidor→cliente                                 |
| Email transaccional (**Resend**)                | Desactivado               | Baja-media  | Disparado tras confirmación de pago                            |

Todo lo demás —UI, rutas, motor de precios, capa de datos— es **el mismo código** en demo y en
producción. Eso es posible gracias a la decisión de diseño de la sección 4.

---

## 2. Stack

| Capa                 | Tecnología                                                            |
| -------------------- | --------------------------------------------------------------------- |
| Framework            | TanStack Start / Router (SPA sobre Vite 7)                            |
| UI                   | React 19, Tailwind CSS v4, Radix UI / shadcn, `react-hook-form` + Zod |
| Estado servidor      | TanStack Query                                                        |
| Backend (producción) | Supabase — Postgres, Row Level Security, Auth, Edge Functions (Deno)  |
| Backend (demo)       | Mock en navegador (`src/integrations/demo/`) sobre `localStorage`     |
| Pagos                | Redsys/TPV — firma 3DES + HMAC-SHA256 _(simulado en la demo)_         |
| Email                | Resend _(desactivado en la demo)_                                     |
| Tooling              | TypeScript, ESLint, Prettier, npm                                     |

Magnitud aproximada: ~11.000 líneas en `src/` (TS/TSX), 14 rutas, ~46 componentes UI.

---

## 3. Modelo de datos (12 tablas)

Esquema reflejado en [`src/integrations/supabase/types.ts`](src/integrations/supabase/types.ts)
(tipos generados desde Postgres). El mock de la demo imita esta misma forma.

**Reservas y clientes**

- `reservations`: estancia con estado (enum de 7 valores: `pending`, `confirmed`, `in_progress`,
  `completed`, `cancelled`, `no_show`, `rejected`), entrada y salida, importes y señal.
- `reservation_extras`: extras asociados a cada reserva (N:M con cantidades).
- `customers`: datos de contacto del huésped.

**Catálogo**

- `rooms`: habitaciones, con capacidad, tipo de tarifa y estado operativo (`available`,
  `occupied`, `cleaning`, `out_of_service`).
- `extras`: extras por categoría (`breakfast`, `parking`, `wellness`, `experiences`, `services`).

**Tarifas y precios** (el dominio rico, ver sección 5)

- `rate_groups`: tipos de habitación a efectos de tarifa (Estándar, Superior, Deluxe…).
- `rate_nightly`: precio por noche, con precio de fin de semana (viernes y sábado) opcional.
- `dynamic_rules`: reglas de precio dinámico (`occupancy` | `date`) con multiplicador y config JSON.
- `gift_thresholds`: extras de regalo al superar un umbral de gasto.
- `promo_codes`: códigos de descuento (porcentaje o importe fijo, de un uso o reutilizables).

**Seguridad y auditoría**

- `user_roles`: rol por usuario (`admin`, `reception`, `customer`).
- `audit_log`: traza de acciones (entidad, acción, payload, usuario).

**Funciones / RPC**

- `has_role(_user_id, _role)`: función _security definer_ usada por las políticas RLS para
  comprobar el rol sin exponer la tabla `user_roles` al cliente.

---

## 4. Decisión de diseño clave: capa de datos agnóstica al backend

Toda la aplicación importa **un único cliente**:

```ts
import { supabase } from "@/integrations/supabase/client";
```

Ese módulo ([`client.ts`](src/integrations/supabase/client.ts)) decide en tiempo de ejecución
qué hay detrás:

- **Con** credenciales `VITE_SUPABASE_*` → cliente real de Supabase.
- **Sin** credenciales (`IS_DEMO`) → mock en navegador, vía un `Proxy` con instanciación perezosa.

```ts
export const IS_DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;
// ...
return IS_DEMO ? createMockClient() : createRealClient();
```

**Consecuencia:** ni una sola pantalla, hook o consulta sabe si habla con Postgres o con el
mock. El resto del código es indiferente. Esto es lo que permite que el repo de portfolio sea
**autónomo** (demo sin servidor) y a la vez **el mismo código** que corre en producción —no es
una rama paralela ni una maqueta aparte.

El mock ([`mock-client.ts`](src/integrations/demo/mock-client.ts), ~430 LOC) reimplementa la
porción de la API de Supabase que la app usa de verdad:

- **Query builder PostgREST:** `select / insert / update / delete` encadenados con
  `eq, neq, gt, gte, lt, lte, in, not, is, order, limit, range, single, maybeSingle` y
  `count` exacto (incluido `head: true`).
- **Auth:** `signIn`, `signOut`, `getSession`, `onAuthStateChange`.
- **`rpc`**, **`functions.invoke`** y un canal **Realtime** simulados.

El dataset semilla ([`seed.ts`](src/integrations/demo/seed.ts)) replica la forma del esquema
real, se persiste en `localStorage` (con versionado para forzar reseed) y se puede reiniciar
desde el aviso flotante «Modo demo».

---

## 5. Motor de precios (lógica de negocio real, no simulada)

[`src/lib/pricing.ts`](src/lib/pricing.ts) calcula el precio combinando varias fuentes —esto
**sí** es la lógica real, idéntica en demo y producción:

1. **Base:** se recorre la estancia noche a noche; viernes y sábado usan el precio de fin de
   semana si está definido.
2. **Precio dinámico**, también noche a noche:
   - **Por fecha:** reglas con rango `from`–`to` que aplican un `+%` (p. ej. temporada alta).
   - **Por ocupación:** calcula la ocupación de cada noche (estancias que la ocupan / habitaciones
     activas) y aplica el recargo del umbral más alto superado.
3. **Regalos por umbral:** si el gasto en extras supera un mínimo, marca extras como regalo.

Devuelve un desglose tipado (`PriceBreakdown`) con base, recargos, motivo del recargo dinámico,
total de extras, IDs regalados y total. Es un cálculo con varias consultas coordinadas, no una
multiplicación.

---

## 6. Separación de limpieza entre reservas (anti-solapamiento)

Requisito operativo del negocio: una habitación necesita **tiempo de limpieza** entre dos
reservas y no puede reservarse durante ese margen. Se modela como una propiedad de cada reserva
(`cleaning_minutes`, mínimo 15) y se hace cumplir en el backend, no en la UI.

- **Ventana ocupada.** Cada reserva ocupa la habitación en `[start_at, end_at + cleaning_minutes)`.
  Dos reservas chocan si sus ventanas se solapan. En producción es un **trigger en Postgres**
  (`check_reservation_gap`) que usa solapamiento de rangos `tstzrange`; en esta demo se reimplementa
  la misma lógica en el mock ([`mock-client.ts`](src/integrations/demo/mock-client.ts),
  `checkReservationGap`), de modo que un `insert`/`update` que solape **falla** igual que contra
  la base real.
- **Reservas que bloquean.** Cuentan las `confirmed/in_progress/completed` siempre, y las
  `pending` sólo si son recientes (< 60 min), para que un pago público abandonado **libere el hueco**.
  Las `cancelled/no_show/rejected` nunca bloquean.
- **Override de administración.** Una reserva marcada `manual_override` se salta la comprobación
  (excepciones puntuales) — mismo comportamiento que el trigger real.
- **Ampliar limpieza y desplazar en cascada.** Si una habitación necesita más limpieza, recepción
  amplía el margen y las reservas posteriores **se reprograman automáticamente** hasta que termina.
  Es una función `extend_cleaning_and_shift` (en producción `SECURITY DEFINER`; en la demo, RPC del
  mock) que recorre la cadena de reservas siguientes preservando su duración y para en cuanto un
  hueco absorbe el retraso. Devuelve cuántas reservas reprogramó.

Esto es lógica de negocio con estado y coordinación temporal — el tipo de detalle operativo que
distingue un producto en explotación de una maqueta.

---

## 7. Gestión de reservas desde recepción

- **Crear y editar.** El mismo diálogo crea o edita una reserva (clic en una reserva del
  calendario o del listado para editarla): carga datos y extras, recalcula precio y guarda.
- **Override de admin.** Permite fijar la hora de salida y un total manual, y se salta la separación de
  limpieza para casos especiales.

---

## 8. Lo que justifica el coste (resumen para evaluación técnica)

- **Pasarela Redsys segura por diseño.** Clave secreta solo en servidor; firma generada en una
  Edge Function derivando la clave por **3DES** sobre el número de pedido y firmando con
  **HMAC-SHA256**. Es la parte específica de España, regulada, y la que más distingue esto de
  un CRUD.
- **Confirmación de pago asíncrona.** El estado definitivo llega por **webhook servidor-a-servidor**
  de Redsys, no por la redirección del usuario. Implica idempotencia, reconciliación de estados
  y tolerancia a que el usuario abandone el navegador.
- **Seguridad de datos con RLS.** Políticas por rol en Postgres apoyadas en `has_role` (security
  definer): el rol anónimo solo puede **crear** reservas, nunca leer datos de otros clientes.
- **Modelo de dominio no trivial.** 12 tablas, 5 enums, precios dinámicos por fecha y ocupación,
  señal parcial online / resto en el hotel.
- **Anti-solapamiento con limpieza** hecho cumplir en el backend, con reprogramación en cascada
  de las reservas siguientes (sección 6) — lógica con estado y coordinación temporal.
- **Arquitectura desacoplada** que permite el mismo código en demo y producción (sección 4).
- **Panel operativo real:** calendario, agenda del día, gestión de reservas/clientes/tarifas/
  extras, informes y notificaciones en tiempo real — software que recepción usa a diario.

### Edge Functions (Deno, en `supabase/functions/`)

Tres funciones server-side, no incluidas en este repo. El reparto de `verify_jwt` es en sí una
decisión de seguridad:

| Función                         | Propósito                                             | `verify_jwt` |
| ------------------------------- | ----------------------------------------------------- | ------------ |
| `create-redsys-payment`         | Genera la petición de pago Redsys (firma server-side) | `true`       |
| `redsys-notification`           | Recibe el callback de Redsys y valida el HMAC         | `false`      |
| `send-reservation-confirmation` | Envía el email de confirmación (Resend)               | `false`      |

`redsys-notification` es público a propósito: lo invoca **Redsys servidor-a-servidor**, sin JWT
de usuario; su autenticación es la **validación de la firma HMAC**, no el token. Esa es justo la
diferencia entre un webhook hecho bien y uno que confía en la redirección del navegador.

---

## 9. Web pública, app del huésped y conector PMS (integración con cualquier PMS)

Sobre el mismo backend viven la **web pública** del hotel (`/web`) y la **app del huésped**
(`/stays`): reserva directa, check-in online, peticiones durante la estancia, instalaciones y club
de fidelización. Ambas se **integran con el PMS por API**; aquí Demo Stays actúa como PMS, pero
podría ser cualquier otro. Cada hotel es un tenant con su propia marca (`src/lib/brand.tsx`).

**El contrato de integración** ([`src/integrations/pms/`](src/integrations/pms/)) es la pieza clave:

- `connector.ts` — la interfaz `PmsConnector`: discovery, disponibilidad, prereservas/reservas,
  fidelización, firma y journal. **Es el único contrato** que la web y la app conocen.
- `types.ts` — DTOs de dominio desacoplados de la forma de fila del PMS (la app nunca ve una fila).
- `demo-stays-connector.ts` — implementación de referencia **sobre el mock existente** + el motor de
  precios real (`calculateNightlyPrice`). Marshala fila↔DTO y escribe el **booking journal**.
- `index.ts` — el singleton `pms`. Integrar otro PMS = implementar `PmsConnector` y cambiarlo aquí;
  la UI no se toca.

**Modelo de dominio añadido** (mismo patrón seed/mock): `provinces` (destinos), `properties` (hoteles) (con `property_id`
en `rooms`); `loyalty_tiers/_accounts/_transactions` y `rewards` para
el club; `signatures` para el registro de viajeros del check-in online; `members` para la identidad del huésped (separada del
auth de staff); y `booking_journal`, traza append-only del ciclo de vida compartida por el conector y
el panel (`/journal`). Las experiencias del hotel (catas, rutas, spa) vienen de un CMS a través de
`CmsClient` (`src/integrations/cms/`).

**Reutilización deliberada:** las prereservas son reservas `pending` con `is_prebooking`/`hold_expires_at`,
de modo que el **trigger anti-solapamiento** (sección 6) las bloquea sin duplicar lógica; confirmar
una prereserva reusa el camino de pago `create-redsys-payment` y acredita puntos según el nivel del
socio. La firma es un `<canvas>` propio (pointer events, sin dependencias) que produce un data URL.

---

_Versión saneada para portfolio. El backend (esquema, migraciones y Edge Functions) no se
incluye para no exponer datos del cliente; la demo lo sustituye por el mock descrito arriba._
