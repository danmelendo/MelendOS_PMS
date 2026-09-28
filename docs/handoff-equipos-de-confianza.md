# Handoff: panel de gestión solo desde equipos de confianza

_29/09/2026. Para una sesión nueva de Claude Code en este repo. Lee antes `CLAUDE.md` y `MAPA.md`._

## Qué quiere Dan

El panel de gestión de Melend/OS (`site/`, página `/admin/`, datos en el **Supabase de ventas**) guarda leads, clientes, contratos, facturas y el registro de accesos de los hoteles. Es **su propio panel de administración** y quiere que solo se pueda usar desde sus equipos.

Sus palabras (29/09/2026):

- «Proteger este área de conexión a la página /admin y heredados».
- «Algo que identifique los equipos, porque es probable que se utilicen datos móviles con el móvil como router o que la CG-NAT del proveedor cambie, movilidad geográfica, etc.».
- «Quiero proteger la web pero no estar vetado cada vez que me mueva».

Lo que Dan ha autorizado para esta tarea: montar este control de acceso sobre su panel (tablas, funciones, Edge Function y pantallas del proyecto de ventas) y quitar el filtro por IP.

## Por qué no IP, MAC ni DNS

- **IP**: ya se hizo (PR #66), pero cambia con los datos móviles, la CG-NAT y los viajes. Dan no lo quiere.
- **MAC**: no sale de la red local, porque cada router la sustituye. Ninguna web puede verla.
- **DNS**: decide qué dominios se resuelven, no qué equipo visita.
- **Passkeys de Supabase**: existen, pero son experimentales. Se descartaron para no apoyar la seguridad en algo experimental.

## Decisión (Dan eligió entre opciones, 29/09/2026)

**Equipos de confianza y app de autenticación, y fuera el filtro por IP.**

1. **La clave del equipo**: cada navegador genera un par de claves ECDSA P-256 con WebCrypto. La privada se crea **no exportable** y se guarda en IndexedDB. La base solo conoce la pública.
2. **La prueba de cada sesión**: al entrar, el equipo **firma su sesión de Supabase** (`session_id` del JWT más la hora). La Edge Function `device-session` comprueba la firma con la clave pública.
   - Si el equipo está aprobado, marca esa sesión como de confianza durante 12 h.
   - `is_sales_admin()`, que usan **todas** las políticas del panel, solo vale para sesiones de confianza. Con la contraseña robada no basta.
3. **Aprobar un equipo nuevo** se hace de una de dos maneras:
   - Desde un equipo de confianza (pestaña Seguridad → Aprobar).
   - Con el **código de 6 dígitos de la app de autenticación** (TOTP de Supabase Auth; la sesión pasa a `aal2`). La primera vez el panel pide configurar la app (QR) y así se aprueba el primer equipo.
4. **Revocar un equipo** (portátil perdido) corta sus sesiones al momento.
5. **Recuperación** sin panel: un script con acceso directo a la base.

## Estado actual

**En producción (os.melendo.app), sin tocar:**

- Panel con pestañas Leads · Clientes · Facturación · Seguridad (#64, #66, #67).
- Filtro por IP (#66): `site/middleware.ts`, tabla `sales_allowed_ips`, pestaña Seguridad y `site/scripts/admin-ips.mjs`. **La lista está vacía, así que no restringe nada.** Hay que quitarlo como parte de esta tarea.

**En la rama `feat/admin-trusted-devices`** (subida, sin PR y sin aplicar ni desplegar nada):

| Archivo                                                       | Qué es                                                                                                                                                                                                                                                                                                                                                     | Estado                                                                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `site/supabase/functions/_shared/device.ts`                   | Mensaje firmado (`deviceMessage`), firma y verificación ECDSA, base64url, `freshProof` (2 min), `deviceName` (del user agent)                                                                                                                                                                                                                              | Hecho, con tests en verde (`device.test.ts`, incluye que la privada no se exporta)                         |
| `site/supabase/migrations/20260929160000_trusted_devices.sql` | Quita el filtro por IP. Crea `sales_devices`, `sales_device_sessions`, `sales_session_trusted()`, `is_sales_account()`, el nuevo `is_sales_admin()` y los RPC `register_sales_device`, `approve_sales_device_with_mfa` (exige `aal2` y un equipo propio), `approve_sales_device` (desde equipo de confianza), `revoke_sales_device` y `list_sales_devices` | Escrita. **Sin probar ni aplicar**                                                                         |
| `site/supabase/functions/device-session/index.ts`             | Valida el JWT (`getUser`), lee `session_id`, comprueba que la cuenta está en `sales_admins`, verifica la firma y guarda la sesión de confianza. Responde `trusted`, `pending`, `revoked` o `unknown`                                                                                                                                                       | Escrita. **Sin desplegar**. `verify_jwt = false` en `site/supabase/config.toml` (valida el JWT ella misma) |
| `site/src/lib/device.ts`                                      | IndexedDB (`melendos-admin`/`device`), creación de la clave, registro, prueba de sesión y `checkDevice(session)`. Un equipo revocado u olvidado se vuelve a registrar con clave nueva y queda pendiente                                                                                                                                                    | Escrito, sin usar todavía                                                                                  |

## Lo que falta

1. **Pantalla de equipo no aprobado** (`site/src/pages/AdminDevice.tsx`), que se muestra cuando `checkDevice` no devuelve `trusted`:
   - Si la cuenta **tiene** un factor TOTP verificado (`auth.mfa.listFactors()`): pedir el código, hacer `auth.mfa.challengeAndVerify` (la sesión pasa a `aal2`), llamar a `approve_sales_device_with_mfa(deviceId)` y repetir `checkDevice`.
   - Si **no tiene**: `auth.mfa.enroll({ factorType: "totp" })` y mostrar el QR (`data.totp.qr_code`) y la clave. Luego verificar, aprobar y comprobar. Antes, borrar con `unenroll` los factores sin verificar que hayan quedado de intentos anteriores.
   - Alternativa en la misma pantalla: «Apruébalo desde otro equipo de confianza (Seguridad → Equipos)» y un botón «Ya lo he aprobado» que repite la comprobación.
   - Si el navegador no puede guardar la clave (modo privado), decirlo.
2. **`site/src/pages/Admin.tsx`**:
   - Hoy usa el RPC `sales_access`, que la migración borra. Sustituirlo por `is_sales_account` (¿es cuenta del panel?) seguido de `checkDevice(session)`.
   - Si está `trusted`, mostrar el panel; si no, la pantalla anterior.
   - Repetir `checkDevice` cada ~6 h, porque la confianza caduca a las 12.
3. **Pestaña Seguridad** (`site/src/pages/AdminSecurity.tsx`): cambiar la gestión de IPs por:
   - La lista de equipos de `list_sales_devices` (dueño, nombre, alta, último uso, estado y «este equipo»).
   - Aprobar y revocar, con confirmación en línea.
   - El estado de la app de autenticación.
4. **Quitar el filtro por IP**:
   - Archivos: `site/middleware.ts`, `site/src/lib/ip.ts`, `site/src/lib/ip.test.ts` y `site/scripts/admin-ips.mjs`.
   - La dependencia `@vercel/functions` y `middleware.ts` del `include` de `site/tsconfig.json`.
   - Las funciones y la tabla ya las borra la migración.
5. **Script de recuperación** `site/scripts/admin-devices.mjs` (con `SALES_DB_URL`, usa `pg`, ya instalado en `site/`):
   - `list`, `approve <id>` (`approved_via = 'script'`), `revoke <id>`.
   - Opcionalmente `reset-mfa <email>` para quitar los factores TOTP de una cuenta si Dan pierde el móvil.
6. **Probar la migración con sus funciones dentro de una transacción con rollback** contra la base de ventas, no solo con un dry run. Simula el JWT con `set_config('request.jwt.claims', …)`, incluidos `session_id` y `aal`. Casos:
   - Registro válido e inválido (con `d`, otra curva).
   - Un equipo pendiente no da acceso.
   - Aprobación con `aal1` rechazada y con `aal2` aceptada.
   - Aprobar desde una sesión de confianza.
   - Revocar corta la sesión.
   - Una sesión caducada no vale.
   - Un anónimo no ve nada.
   - `generate_client_invoices()` por cron sigue funcionando (sin `auth.uid()`).

   Ejemplos de estas pruebas en transacción: los scripts `*-trial.mjs` de la sesión anterior; el patrón está en el historial de los PR #64 a #67.

7. **Desplegar, en este orden y avisando antes a Dan**, porque en cuanto se aplique la migración el panel antiguo deja de ver datos:
   1. PR con la CI en verde.
   2. `npx supabase functions deploy device-session --project-ref wtxtgafohvjidmrqtamd --use-api` (con `site/.env` cargado; su token solo ve el proyecto de ventas).
   3. Integrar el PR; Vercel publica la web.
   4. Enseguida, `npx supabase db push --db-url "$SALES_DB_URL"` desde `site/`.
   5. Dan entra, configura la app y aprueba su equipo.
8. **Documentar**:
   - `site/README.md`: sección Seguridad.
   - `CLAUDE.md`: sustituir la entrada «Panel de gestión solo desde IPs permitidas».
   - `Cambiospendientes.md`: la tarea del filtro, con el PR nuevo.

## Riesgos y detalles a tener en cuenta

- **Ventana de arranque**: hasta que Dan configure la app, alguien con su contraseña podría configurar su propia app y aprobar su equipo. Supabase exige `aal2` para añadir un segundo factor, así que la ventana se cierra en cuanto Dan configura el suyo. Pídele que lo haga nada más desplegar.
- `session_id` viene en el JWT de Supabase y se mantiene al refrescar el token y al pasar a `aal2`.
- `SITE_ORIGIN` (orígenes permitidos, separados por comas) ya está puesto en el proyecto de ventas. La función lo usa para CORS y admite `localhost` en desarrollo.
- Probar la interfaz con sesión requiere la cuenta de Dan: pídele que lo pruebe él. Una página temporal con datos de ejemplo sirve para revisar el aspecto (así se hizo con la factura en #67; hace falta una configuración de Vite mínima, porque la del sitio exige una entrada SEO por página).
- En esta máquina, los heredocs de bash rompen las barras invertidas. Escribe los scripts con la herramienta Write.
- Nunca secretos en el repo (GitGuardian escanea los PR). Las claves están en `site/.env`.

## Fuera de esta tarea (pendiente de Dan)

- Rol «Administrador» (soporte con control total en el PMS): en `git stash` («platform-admin role»), pendiente de su permiso.
- VERI\*FACTU en las facturas de Melend/OS: pendiente del alta como autónomo o sociedad.
