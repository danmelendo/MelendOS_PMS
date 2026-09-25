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

## 🚀 Probar la demo (sin backend)

```bash
npm install
npm run dev      # arranca Vite; abre la URL que imprime (p. ej. http://localhost:5173)
```

No hace falta `.env` ni ningún servicio externo. Sin variables `VITE_SUPABASE_*`, la app
arranca contra un **backend simulado en el navegador** (`src/integrations/demo/`): un dataset
de ejemplo persistido en `localStorage` y un cliente que imita la API de Supabase (consultas,
auth, RPC, Edge Functions y Realtime). El pago Redsys se simula y el email es un no-op. El aviso
flotante **«Modo demo»** permite reiniciar los datos.

| Ruta     | Qué es                                                                |
| -------- | --------------------------------------------------------------------- |
| `/web`   | Web pública del hotel: descubrimiento, ficha de habitación y reserva  |
| `/stays` | App del huésped: estancias, check-in online, club de fidelización     |
| `/today` | Panel de gestión (PMS); entras ya autenticado como administrador demo |

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

- Búsqueda de disponibilidad y precios por noche, reserva con **señal del 30 % online**.
- **Prereserva:** bloquea la habitación 30 minutos mientras se completa el pago.
- Check-in online con firma digital y subida de documentación.
- Club de fidelización con niveles, puntos y recompensas.
- Avisos de disponibilidad por notificación del navegador.
- Todo consume el PMS a través de un **conector tipado** (`src/integrations/pms/`, interfaz
  `PmsConnector`): integrar otro PMS es implementar esa interfaz.

## 🧱 Stack técnico

| Capa           | Tecnología                                                              |
| -------------- | ----------------------------------------------------------------------- |
| Framework      | **TanStack Start / Router** (SPA con Vite 7)                            |
| UI             | React 19, Tailwind CSS v4, Radix UI / shadcn, `react-hook-form` + Zod   |
| Datos cliente  | TanStack Query                                                          |
| Backend        | **Supabase**: Postgres, Row Level Security, Auth, Edge Functions (Deno) |
| Backend (demo) | Mock en navegador (`src/integrations/demo/`) sobre `localStorage`       |
| Pagos          | **Redsys** (firma `3DES` + `HMAC-SHA256`), entorno de pruebas           |
| Tooling        | TypeScript, ESLint, Prettier, Vitest, npm                               |

## 🏗️ Arquitectura

```
src/
  routes/            Rutas: /web/*, /stays/*, panel /_app/*
  components/        UI compartida (editor de reservas, barra lateral, ...)
  integrations/
    supabase/        Cliente de datos: Supabase real o mock según haya credenciales
    demo/            Backend simulado: dataset seed + cliente mock
    pms/             Contrato PmsConnector + implementación sobre este backend
    cms/             Contrato CmsClient (experiencias del hotel)
  lib/               Motor de precios, datos y helpers
```

La app importa **un único cliente** (`@/integrations/supabase/client`) y el resto del código es
agnóstico a si detrás hay Supabase o el mock. Más detalle en [`ARCHITECTURE.md`](ARCHITECTURE.md).

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
