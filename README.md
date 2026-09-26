# Demo Stays · Motor de reservas y PMS para hoteles

> Plataforma de reservas para hoteles tradicionales (estancias por noches): web pública con
> reserva y pago, app del huésped y panel de gestión (PMS) para recepción y administración.
>
> ⚠️ **Repositorio de portfolio.** Todos los datos (hoteles, habitaciones, precios, huéspedes)
> son ficticios. No contiene claves ni datos reales.
>
> 🚧 En desarrollo: se está añadiendo una capa de IA (agente de reservas, servidor MCP, evals).
> El README definitivo, en inglés, llegará al final de ese trabajo.

---

## 🚀 Arrancar en local

```bash
npm install
cp .env.example .env   # y rellena los datos del proyecto Supabase de la demo
npm run dev            # abre la URL que imprime (p. ej. http://localhost:5173)
```

La app siempre trabaja contra un proyecto Supabase real. En desarrollo es el de la demo, que
también es el entorno de **preproducción**: cada cambio se prueba ahí antes de llegar a
producción. En la demo se entra eligiendo una cuenta ficticia de una lista
(`VITE_DEMO_ACCESS=true`); en producción, con el formulario normal.

| Ruta     | Qué es                                                               |
| -------- | -------------------------------------------------------------------- |
| `/web`   | Web pública del hotel: descubrimiento, ficha de habitación y reserva |
| `/stays` | App del huésped: estancias, check-in online, club de fidelización    |
| `/today` | Panel de gestión (PMS); en la demo eliges una cuenta ficticia        |

## ✨ Qué hace

**Panel de gestión (PMS)**

- **Hoy:** llegadas con check-in, salidas con check-out, huéspedes alojados y ocupación de la noche.
- **Planning:** habitaciones × días; clic en una celda libre para reservar, en una estancia para editarla.
- **Editor de reservas** en panel lateral con vista previa de la habitación, disponibilidad y
  desglose de precio en vivo.
- **Tarifas por noche** (semana y fin de semana) y **precio dinámico** por fecha y por ocupación,
  aplicado noche a noche.
- **Separación de limpieza** entre estancias, con ampliación y reprogramación en cascada.
- Extras (desayuno, parking, spa, experiencias), regalos por umbral de gasto, códigos promo,
  clientes, informes, roles (administración / recepción) y **booking journal** inmutable.

**Web pública y app del huésped**

- Búsqueda de disponibilidad con calendario de precios por noche; pago online completo o en el
  hotel, con política de cancelación por hotel.
- **Prereserva:** bloquea la habitación 30 minutos mientras se completa el pago.
- Check-in online con firma digital y subida de documentación.
- Club de fidelización con niveles, puntos y recompensas.
- Avisos de disponibilidad por notificación del navegador.
- Todo consume el PMS a través de un **conector tipado** (`src/integrations/pms/`, interfaz
  `PmsConnector`): integrar otro PMS es implementar esa interfaz.

## 🧱 Stack técnico

| Capa          | Tecnología                                                              |
| ------------- | ----------------------------------------------------------------------- |
| Framework     | **TanStack Start / Router** (SPA con Vite 7)                            |
| UI            | React 19, Tailwind CSS v4, Radix UI / shadcn, `react-hook-form` + Zod   |
| Datos cliente | TanStack Query                                                          |
| Backend       | **Supabase**: Postgres, Row Level Security, Auth, Edge Functions (Deno) |
| Pagos         | **Redsys** (firma `3DES` + `HMAC-SHA256`), entorno de pruebas           |
| Tooling       | TypeScript, ESLint, Prettier, Vitest, npm                               |

## 🏗️ Arquitectura

```
src/
  routes/            Rutas: /web/*, /stays/*, panel /_app/*
  components/        UI compartida (editor de reservas, barra lateral, ...)
  integrations/
    supabase/        Cliente de datos (Supabase)
    pms/             Contrato PmsConnector + implementación sobre este backend
    cms/             Contrato CmsClient (experiencias del hotel)
  lib/               Motor de precios, datos y helpers
```

La app importa **un único cliente** (`@/integrations/supabase/client`). Más detalle en
[`ARCHITECTURE.md`](ARCHITECTURE.md).

## 🛠️ Scripts

| Script              | Qué hace                              |
| ------------------- | ------------------------------------- |
| `npm run dev`       | Servidor de desarrollo                |
| `npm run typecheck` | `tsc --noEmit`                        |
| `npm run lint`      | ESLint + Prettier                     |
| `npm run test`      | Tests unitarios (Vitest)              |
| `npm run build`     | Build de producción                   |
| `npm run check`     | Todo lo anterior en orden, como la CI |

## 🔀 Flujo de trabajo

- Todo cambio entra por **pull request hacia `main`**; no se hace push directo.
- La CI (`.github/workflows/ci.yml`) ejecuta typecheck, lint, tests y build en cada PR y en cada
  push a `main`. Un PR solo se integra con la CI en verde.
- Recomendado en GitHub: activar la **protección de rama** de `main` (PR obligatorio y check `CI`
  requerido).
- La lógica de negocio compartida con las Edge Functions vive en
  `supabase/functions/_shared/domain/` (TypeScript puro, sin dependencias) y se importa en el
  frontend con el alias `@domain`. Sus tests están junto al código (`*.test.ts`).
