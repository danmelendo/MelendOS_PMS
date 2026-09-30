# Plan: Melend/OS empaquetado para instalar en un VPS

_30/09/2026, ampliado el mismo día con las copias en el propio VPS y el asistente de alta. Plan de trabajo; nada de esto está construido todavía. Después se hará una prueba con un VPS real (sección 10)._

## 1. Objetivo

Instalar Melend/OS completo en un servidor (un VPS) con un solo instalador y actualizarlo con un solo comando. Hoy el producto vive en dos servicios gestionados: el frontend en un hosting estático y el backend en Supabase Cloud. El paquete tiene que servir para dos casos con el mismo código:

- **Instalación dedicada para un cliente**: un hotel o una cadena que quiere sus datos en su propio servidor.
- **Nuestra propia nube en VPS**: varios hoteles en una instalación, como alternativa a Supabase Cloud, si sale más barato o nos da más control.

La app ya es multi-hotel, así que los dos casos son la misma instalación con uno o con varios hoteles dados de alta. Se mantiene la regla de siempre: **entre entornos solo cambia la configuración, nunca el código.**

### Cómo lo vamos a construir: primero a mano, después el instalador

(Dan, 30/09/2026: «demos de alta en un VPS para que veas exactamente cuál es el proceso, anotes qué errores te encuentras… y así trabajamos sobre algo que ya se ha realizado».)

1. **Instalación a mano en un VPS real, con bitácora.** Se sigue este plan paso a paso en un VPS de pruebas y se anota todo en `docs/vps-bitacora.md`: cada orden ejecutada, lo que tardó, cada error con su causa y su arreglo, y lo que hubo que cambiar en el código. Termina con un hotel ficticio funcionando como en producción: pagos de prueba, emails, check-in, copias y vuelta atrás.
2. **El paquete y el comando `melendos` salen de la bitácora.** Cada paso que funcionó a mano se convierte en un paso del instalador, y cada error encontrado, en una comprobación previa o en un arreglo automático. Nada se escribe «de memoria».
3. **El asistente del panel de gestión** (sección 6) ejecuta ese mismo instalador en remoto.
4. **Prueba final en un VPS limpio** (sección 10): el instalador tiene que dejarlo todo funcionando sin intervención. Si hay que tocar algo a mano, se vuelve al punto 2.

Las secciones 4 a 9 son lo que esperamos encontrar; la bitácora dirá qué sobra y qué falta.

## 2. Qué hay que instalar

| Pieza                          | Hoy                                      | En el VPS                                                                                            |
| ------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Web de reservas, panel, widget | SPA estática (`dist/`) en Netlify/Vercel | Contenedor **Caddy** que sirve `dist/` y termina el HTTPS                                            |
| Base de datos                  | Supabase Cloud (Postgres 17)             | Postgres de la imagen de Supabase (`supabase/postgres`, trae `pg_cron`, `pg_net`, Vault, `pgcrypto`) |
| Login, 2FA, invitaciones       | Supabase Auth                            | GoTrue (contenedor `auth`)                                                                           |
| API                            | PostgREST gestionado                     | PostgREST (`rest`) detrás de Kong                                                                    |
| Chat en tiempo real            | Supabase Realtime                        | `realtime`                                                                                           |
| Fotos y data lake              | Supabase Storage                         | `storage` con disco local (o S3 compatible)                                                          |
| 19 Edge Functions              | Supabase Edge Functions                  | `edge-runtime` con las funciones montadas como volumen                                               |
| Tareas programadas             | `pg_cron` + GitHub Actions               | `pg_cron` igual; lo de GitHub Actions (alertas, lake) pasa a temporizadores `systemd` del VPS        |
| IA                             | API compatible con OpenAI                | Igual (API externa). Ollama local solo si el servidor tiene GPU; en un VPS normal, no                |

Es el `docker compose` oficial de Supabase autoalojado, más nuestras piezas encima. Supabase Studio (el panel de la base) **no se publica**: se abre por túnel SSH cuando hace falta.

## 3. Requisitos del servidor

- **Mínimo razonable para una instalación** (la prueba a mano): 4 vCPU, 8 GB de RAM y 160 GB de SSD. Para varias, ver abajo. Supabase autoalojado pide unos 4 GB solo para arrancar, así que con 4 GB va justo. El disco va doble porque las copias para volver atrás se guardan en el propio VPS (sección 8); mejor en un volumen aparte del disco del sistema, que la mayoría de proveedores venden por separado. Medirlo en la prueba.
- **Sistema**: Ubuntu 24.04 LTS, Docker Engine y el plugin de Compose.
- **Ubicación en la UE** (datos personales, SES.HOSPEDAJES): Hetzner (Alemania/Finlandia), OVH (Francia) o un proveedor español (IONOS, Arsys) si el cliente lo pide. Hay que confirmar precios en cada proveedor; en la gama de 4 vCPU/8 GB suelen rondar las decenas de euros al mes.
- **DNS**: un dominio con tres nombres apuntando al VPS (sección 7).
- **Salida a internet** hacia Redsys/Stripe, Resend, la AEAT, el Ministerio del Interior y el proveedor de IA. **Entrada** solo por los puertos 80 y 443.

### Varios hoteles por VPS, cada uno con su instalación (decidido)

(Dan, 30/09/2026: «dentro de un mismo VPS servir a más de un hotel, con tope de 10 por VPS para repartir la carga y que no se pierda el servicio en todos a la vez; en el VPS deben estar diferenciados y cada uno con su instalación independiente».)

- **La unidad es el cliente.** Un hotel independiente tiene su instalación. Una cadena tiene una sola instalación con sus hoteles dentro, porque dirección de grupo los ve juntos. **Tope: 10 instalaciones por VPS.**
- **Cada instalación es completa y aparte:**
  - su base de datos y sus servicios;
  - su `.env` con sus secretos;
  - sus copias y puntos de restauración;
  - su versión, que se actualiza sin tocar a las demás.
- En el VPS solo se comparte:
  - Docker;
  - un **Caddy delante** que reparte por dominio a cada instalación y saca los certificados;
  - el temporizador que vigila a todas.
- **Límites por instalación** (CPU y memoria, con los límites de Docker): un hotel con mucho tráfico o un proceso que se dispare no puede ralentizar a los otros nueve.
- **Instalación adelgazada:** de la pila de Supabase quedan solo las piezas que usa Melend/OS (base, login, API, tiempo real, ficheros, funciones y la pasarela Kong). Sin Studio, `analytics`, `vector`, `imgproxy` ni `supavisor`. Así cada instalación ocupa lo mínimo.
- **Tamaño (a confirmar en la instalación a mano):**
  - Estimación: 1–1,5 GB de RAM por instalación en reposo y 5–10 GB de disco, más sus copias.
  - Para 10 instalaciones: unos 8 vCPU, 32 GB de RAM y 400–500 GB de disco (o un volumen aparte para las copias).
  - Si no compensa, dos VPS de 5.
- **Frente a una sola instalación con 10 hoteles:**
  - Una sola gastaría del orden de un tercio de la memoria.
  - A cambio, una actualización, un fallo de la base o una restauración afectarían a los 10 a la vez.
  - Se elige aislar; el coste extra entra en el precio del alojamiento.
- **Reparto:** el asistente (sección 6) ve cuántas instalaciones y cuánta memoria libre tiene cada VPS, y propone el más holgado. Mover una instalación de VPS es copia y restauración: la misma operación que un simulacro.

### Coste y rentabilidad

(Dan, 30/09/2026: «se iría mucho de precio un VPS así; hay que encontrar un balance en el que sea rentable; se quedó fuera de los gastos del plan de negocio».)

**Precios de mercado** (septiembre de 2026, sin IVA, comprobar al contratar). En 2026 la RAM se ha encarecido y los proveedores han subido: Hetzner dos veces (abril y junio, algunos planes más del doble), netcup hasta un 110 % en servidores y OVH en torno a un 10 %.

| Proveedor y plan                    | CPU            | RAM   | Disco          | €/mes      | Por instalación (÷10) |
| ----------------------------------- | -------------- | ----- | -------------- | ---------- | --------------------- |
| OVH VPS-4                           | 12 vCore       | 48 GB | 300 GB         | ~37        | ~3,7                  |
| OVH VPS-3                           | 8 vCore        | 24 GB | 200 GB         | ~20        | ~2 (para ~5)          |
| netcup VPS 4000 (contrato 12 meses) | 12 vCore       | 32 GB | 512 GB         | ~45        | ~4,5                  |
| Hetzner AX42 (servidor dedicado)    | 8 núcleos/16 h | 64 GB | 2×512 GB RAID1 | ~97 + alta | ~9,7                  |
| Hetzner Cloud CPX62                 | 16 vCPU        | 32 GB | —              | ~130       | ~13                   |
| Hetzner Cloud CCX33 (CPU dedicada)  | 8 vCPU         | 32 GB | —              | ~139       | ~14                   |

Descartados para producción: Contabo (el más barato, pero con CPU muy compartida y soporte flojo) y los planes baratos de Hetzner Cloud, que ya no se pueden contratar.

**Coste por instalación** = parte del VPS, más ~1 € de copia fuera, más el tiempo de mantenerla. El tiempo de mantenimiento es el coste escondido, y por eso el instalador, las actualizaciones y las alertas tienen que ser automáticos. Con OVH o netcup sale en unos **5 € al mes**; con Hetzner dedicado, ~11 €; con Hetzner Cloud, ~15 €.

**Qué deja cada plan al mes** (cliente típico del modelo de `site/supabase/functions/_shared/plans.ts`; «servirlo» es su soporte y su consumo, antes de los costes fijos):

| Plan                        | Ingreso | Servirlo | Con VPS a 5 € | a 11 € | a 15 € |
| --------------------------- | ------- | -------- | ------------- | ------ | ------ |
| Hostal (10 hab.)            | 39      | 19,5     | **14,5**      | 8,5    | 4,5    |
| Esencial (20 hab.)          | 80      | 38       | **37**        | 31     | 27     |
| Profesional (35 hab.)       | 315     | 67,5     | **242,5**     | 236,5  | 232,5  |
| Grupo (2 hoteles, 120 hab.) | 960     | 180      | **775**       | 769    | 765    |

**Para el negocio entero** (mismo modelo):

- Punto muerto: pasa de 42 contratos a 43 (VPS a 5 €) o 45 (a 11–15 €).
- 20 % de margen: pasa de 54 contratos a 55–58.
- Cinco VPS de OVH dan para unos 50 clientes y cuestan unos 185 €/mes, más unos 50 € de copias fuera. A cambio, sobra buena parte de lo previsto para Supabase de pago con PITR dentro de los 900 € fijos.

**Conclusiones:**

1. **El VPS no es lo que decide la rentabilidad; el equipo sí** (9.200 €/mes). Pero el proveedor importa para el plan Hostal: con Hetzner Cloud deja 4,5 € al mes y con OVH o netcup, 14,5 €.
2. **Propuesta de proveedor:** OVH (Francia, RGPD y la mejor relación RAM/precio) o netcup (Alemania, más disco). Hetzner dedicado (AX42) cuando haya clientes grandes que llenen un servidor. El instalador tiene que funcionar en cualquiera, para poder cambiar si vuelven a subir precios.
3. **Empezar pequeño:** los primeros clientes van en un VPS mediano (OVH VPS-3, ~20 €, ~5 instalaciones). Se sube de plan o se añade un segundo VPS al acercarse al tope. La prueba a mano sirve para medir cuánta RAM gasta de verdad cada instalación: si es menos de lo estimado, caben más o sirve un VPS más barato.
4. **Contrato del proveedor a 12 meses** cuando haya clientes: fija el precio frente a nuevas subidas y sale más barato.
5. **Cliente que quiere un servidor solo para él:** es otro producto, con su VPS entero repercutido (desde ~20–40 €/mes más) y en la implantación.
6. **Pendiente en el modelo:** sumar el coste por instalación a `SERVE_COST` en `plans.ts`, y bajar de los 900 € fijos lo que ya no se gaste en Supabase, cuando se elija proveedor.

Fuentes de precios: [Hetzner, ajuste del 15/06/2026](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/), [resumen de precios de Hetzner Cloud en 2026](https://agentdeals.dev/hetzner-pricing-2026), [OVH VPS-3](https://www.vpsbenchmarks.com/hosters/ovhcloud/plans/vps-3), [cambios de precio de OVH](https://blog.ovhcloud.com/en/posts/pricing-evolution-of-public-cloud-bare-metal-and-vps-at-ovhcloud/), [netcup VPS](https://www.netcup.com/en/server/vps), [subida de netcup en 2026](https://servercalc.com/news/netcup-price-increase-2026/), [Hetzner AX42](https://www.hetzner.com/dedicated-rootserver/ax42/), [Contabo](https://contabo.com/blog/cheapest-eu-vps-high-ram-gdpr/).

### Rendimiento

Dan notó en la demo que el calendario tarda en mostrar los precios y la web, en cargar las habitaciones libres. Medido el 30/09/2026 contra la demo (Supabase Cloud, plan gratuito):

- **Coste de red de la nube:**
  - cada llamada a una Edge Function tiene un coste fijo de 0,25–0,35 s, aunque no consulte nada;
  - cada consulta directa a la API, unos 0,07 s;
  - las funciones corren lejos de la base y cada consulta que hacen es un viaje de ida y vuelta.
- **Coste del propio código:** la web hacía hasta 80 peticiones y calculaba precios habitación por habitación. Arreglado en el PR #88: ahora son 28 peticiones y de 1,5–1,9 s se baja a 0,9 s en la página del hotel; el calendario de precios, de 0,75–0,9 s a 0,5–0,7 s.
- **En el VPS**, la base, las funciones y la API están en la misma máquina: cada consulta cuesta milisegundos, no decenas, y las funciones no «se enfrían». Por eso debería ir claramente más rápido que la demo.
- **Objetivos que se medirán en la bitácora:**
  - API por debajo de 100 ms;
  - página del hotel con precios y calendario por debajo de 400 ms;
  - todo ello también con una prueba de carga que simule el tráfico de 10 hoteles a la vez (`k6`).

## 4. Cambios en el código antes de empaquetar

Esto es lo que impide hoy instalarlo tal cual. Hay que hacerlo antes de la prueba.

1. **Configuración del frontend en tiempo de ejecución.** Las `VITE_*` (URL y clave de la API, `VITE_PLATFORM_DOMAIN`, `VITE_PLATFORM_CNAME`, `VITE_DEMO_ACCESS`) se meten en el build, lo que obliga a compilar una versión por cliente. Propuesta:
   - Caddy sirve un `/config.js` generado al arrancar desde el `.env` (`window.__MELENDOS__ = {…}`).
   - La app lo lee antes que `import.meta.env`.
   - Una sola imagen del frontend sirve para todos los clientes.
2. **Funciones sin la CLI de Supabase.** En autoalojado no hay `supabase functions deploy`: las funciones son una carpeta que carga `edge-runtime` a través de una función `main` que enruta.
   - Hay que añadir esa función `main`.
   - Hay que comprobar que respeta el `deno.json` propio de algunas funciones (`bookings-create`, `mcp`, `agent-chat`…).
   - Hay que desactivar la verificación de JWT global, porque cada función comprueba la sesión por su cuenta.
3. **Secretos de las funciones.** Pasan de `supabase secrets set` a variables de entorno del contenedor `functions`, definidas en el `.env` de la instalación. La tabla de secretos de `DEPLOY.md` se convierte en el `.env.example`.
4. **Tareas programadas que llaman a funciones.** `*-setup.mjs` guardan en Vault la URL pública de cada función. En el VPS conviene la interna (`http://kong:8000/functions/v1/…`), así que hay que añadir un parámetro `--functions-url`.
5. **Comprobaciones de producción.** `scripts/prod-check.mjs` usa la Management API de Supabase, que no existe en autoalojado. Hace falta un modo `--self-hosted` que:
   - lea la configuración de Auth de las variables de GoTrue;
   - revise las copias de seguridad en lugar de PITR;
   - mire secretos, cron, datos de la demo y hoteles igual que ahora.
6. **Alertas y data lake.** `ops-alerts.yml` y `lake.yml` corren hoy en GitHub Actions contra la demo. En el VPS pasan a temporizadores `systemd` que ejecutan los mismos scripts. Las alertas llegan a Melend/OS por email o webhook, porque no habrá repositorio de GitHub en el servidor del cliente.
7. **Claves de la API.** En autoalojado se usan las claves `anon`/`service_role` (JWT firmados con el secreto del proyecto) en lugar de las nuevas `sb_publishable_…`/`sb_secret_…`. La app ya distingue clave pública y de servicio por su valor, no por su forma. Hay que revisar que ningún script dependa del prefijo.
8. **Certificados de los dominios propios de los hoteles.** Caddy lo resuelve con _on-demand TLS_: emite el certificado del dominio del hotel la primera vez que alguien entra, pero solo si una comprobación nuestra (`ask`) confirma que ese dominio es de un hotel dado de alta (`tenants.domain`). Esto cierra la decisión pendiente de `docs/web-y-dominio.md` para el caso VPS.

## 5. El paquete

Todo en `deploy/vps/` del repo, versionado con el producto:

- **`docker-compose.yml`**: la pila de Supabase con versiones fijadas, más:
  - `web`: Caddy con `dist/` y `config.js`;
  - `functions`: nuestras funciones;
  - `migrate`: un contenedor que aplica las migraciones y termina.
- **`.env.example`**: dominio, correo del administrador, claves de Resend y de IA, datos del productor de VERI\*FACTU, etc. Los secretos internos (contraseña de Postgres, secreto JWT, claves `anon`/`service_role`, claves de los cron) **los genera el instalador**; nadie los escribe a mano.
- **Imágenes publicadas** en GitHub Container Registry, una por versión (`vX.Y.Z`):
  - `melendos-web`: el frontend compilado;
  - `melendos-functions`;
  - `melendos-migrate`: las migraciones y los scripts de alta.
- **Comando `melendos`** (script de shell en el VPS):

| Orden                                  | Qué hace                                                                                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `melendos install`                     | Comprueba requisitos, genera secretos, pide dominio y correo, arranca la pila, aplica migraciones, programa los cron, crea la cuenta de soporte (`platform`) y deja el sistema listo |
| `melendos hotel add hotel.json`        | Alta de un hotel con `scripts/create-hotel.ts`, que ya existe e invita a dirección por email                                                                                         |
| `melendos update [versión]`            | Copia de seguridad, descarga de las imágenes nuevas, migraciones, reinicio y prueba de humo; si la prueba falla, vuelve a la versión anterior                                        |
| `melendos backup` / `melendos restore` | Ver sección 8                                                                                                                                                                        |
| `melendos rollback`                    | Vuelve a la versión y a los datos del último punto de restauración (sección 8)                                                                                                       |
| `melendos doctor`                      | `prod-check` en modo autoalojado, `smoke.mjs`, espacio en disco, certificados, colas atascadas                                                                                       |
| `melendos logs [servicio]`             | Registros                                                                                                                                                                            |
| `melendos support on/off`              | Abre o cierra el acceso de soporte de Melend/OS (rol «Administrador» y clave SSH), con constancia en `audit_log`                                                                     |

Lo exclusivo de la demo queda fuera por defecto: `DEMO_ACCESS`, `seed-auth`, simulador de historial y semillas.

## 6. Asistente de alta: el instalador completo

Cada hotel o cliente nuevo no debería pedir trabajo manual. El asistente es un formulario del panel de gestión: se rellena una vez y se encarga de todo lo demás, del servidor vacío al hotel funcionando. El comando `melendos` (sección 5) sigue siendo el motor; el asistente lo ejecuta en remoto y deja constancia de cada paso.

### Dónde vive

- **En el panel de gestión** (`/site/admin`, proyecto de ventas), pestaña nueva **«Instalaciones»**, junto a Clientes y Facturación. Cada instalación cuelga de un cliente y rellena sola sus hoteles (`client_hotels`), enlaces y registro de accesos.
- **Lo ejecuta un orquestador**, porque un navegador no puede conectarse por SSH a un servidor:
  - **Al principio: un workflow de GitHub Actions** que el panel lanza con los datos del formulario. No hace falta otro servidor, deja el registro de cada paso y las altas son pocas (gasta pocos minutos).
  - **Más adelante, si hay muchas altas**: un pequeño servicio propio en un VPS de Melend/OS que haga lo mismo.
- Solo pueden lanzarlo sesiones de confianza del panel de gestión (equipos aprobados y verificación en dos pasos, como ya exige el panel). Antes de tocar un servidor que ya tiene datos, pide confirmación expresa.

### Tres usos

1. **Cliente nuevo con su VPS**: instala todo y da de alta su primer hotel.
2. **Hotel nuevo en una instalación que ya existe**: una cadena que abre otro hotel, o un hotel más en nuestra nube multi-hotel. Solo hace el alta (paso 9 de abajo), con su punto de restauración previo.
3. **Mantenimiento** desde la misma pestaña: ver versión y estado de cada instalación, actualizar, volver atrás y restaurar.

### Qué se rellena

| Bloque             | Datos                                                                                                                                                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cliente            | Uno de los clientes del panel (contrato, plan y paquetes ya están ahí)                                                                                                                                                                                                                    |
| Servidor           | Un VPS ya registrado (el asistente propone el más holgado, con un máximo de 10 instalaciones) o uno nuevo: IP, puerto SSH y usuario administrador                                                                                                                                         |
| Acceso             | **Preferido:** el asistente enseña nuestra clave pública y un comando de una línea para autorizarla en el VPS. **Alternativa:** la contraseña de administración, de un solo uso: se usa para instalar nuestra clave, se desactiva el acceso por contraseña y no se guarda en ningún sitio |
| Dominio            | Dominio del cliente y nombres para panel, reservas y API; comprobación de que ya apuntan a la IP                                                                                                                                                                                          |
| Servicios externos | Email de envío (Resend) e IA: los nuestros o los del cliente                                                                                                                                                                                                                              |
| Hotel              | Lo mismo que hoy lleva `scripts/hotel.example.json`: nombre, horas de entrada y salida, formas de pago, cancelación, marca, establecimientos, tipos de habitación y tarifas, y emails de dirección y recepción                                                                            |
| Datos anteriores   | Excel/CSV de habitaciones y de reservas del sistema anterior (los lectores ya existen: `_shared/onboarding/csv.ts` y `reservations-csv.ts`). Se validan antes de instalar y se enseñan los errores por fila                                                                               |

Las credenciales del hotel (TPV del banco, SES.HOSPEDAJES, certificado de VERI\*FACTU) **no se piden en el asistente**: las mete el propio hotel en su panel (Configuración). Así nunca pasan por nosotros, y el email de bienvenida le dice qué le falta.

### Qué hace, paso a paso

Cada paso se ve en la pantalla con su estado y su registro. Si uno falla, se corrige y se relanza desde ahí sin repetir lo hecho: todos los pasos se pueden repetir sin duplicar nada.

1. Comprueba el acceso y el servidor: sistema, RAM, disco, puertos libres y DNS.
2. Endurece el servidor: usuario `melendos` con nuestra clave, sin acceso por contraseña ni de root, cortafuegos, `fail2ban` y actualizaciones automáticas del sistema.
3. Instala Docker.
4. Descarga el paquete de la versión elegida, genera los secretos y escribe el `.env`.
5. Arranca los servicios y espera a que respondan.
6. Monta la base de datos: migraciones, tareas programadas, Vault y la cuenta de soporte (rol «Administrador»).
7. Obtiene los certificados HTTPS.
8. Crea el primer punto de restauración (sección 8).
9. Da de alta el hotel (`create-hotel`) e importa habitaciones y reservas, con un punto de restauración justo antes.
10. Pasa `melendos doctor` y la prueba de humo.
11. Apunta el resultado en el panel de gestión: URLs, IP, versión y dónde está cada acceso (nunca el secreto, como ya hace el registro de accesos).
12. Envía las invitaciones a dirección y recepción y el email de bienvenida con lo que queda por configurar.

### Credenciales

- En los servidores solo está nuestra **clave pública**, con un usuario limitado.
- La **clave privada de despliegue** vive en los secretos del orquestador (una por entorno, se puede rotar) y nunca en el panel ni en la base.
- Las contraseñas que se escriban en el formulario se usan una vez y se descartan.
- Todo esto encaja con la decisión del panel de gestión: registrar dónde está cada credencial, no guardarla.

### Más adelante

Si el VPS lo contratamos nosotros, el asistente puede crearlo con la API del proveedor (Hetzner la tiene). Entonces ni siquiera hay que escribir la IP: se elige el tamaño y la ubicación y el resto sigue igual.

## 7. Cómo queda una instalación

Ejemplo con un cliente que tiene `hotelsol.es`:

| Dirección              | Qué es                                                                           |
| ---------------------- | -------------------------------------------------------------------------------- |
| `panel.hotelsol.es`    | Panel de gestión                                                                 |
| `reservas.hotelsol.es` | Web de reservas y widget (`embed.js`)                                            |
| `api.hotelsol.es`      | API (Kong): la usan la app, las pasarelas (notificaciones de pago) y los canales |

Si es nuestra nube con varios hoteles, lo mismo con nuestro dominio: `*.reservas.melendo.app` más los dominios propios de cada hotel por _on-demand TLS_.

Auth (en el `.env`):

- _Site URL_ y _Redirect URLs_ del panel y de la web.
- SMTP de Resend con dominio verificado.
- Registro público cerrado.
- TOTP activado.

## 8. Copias de seguridad y vuelta atrás

En autoalojado no hay PITR de Supabase: es lo que más cambia y hay que tratarlo como bloqueante.

### En el propio VPS, para volver atrás al momento

Las copias se guardan en el servidor, en `/var/backups/melendos`, a ser posible en un volumen aparte del disco del sistema. Así cualquier vuelta atrás es inmediata y no depende de descargar nada.

- **Puntos de restauración automáticos:**
  - antes de cada `melendos update`;
  - antes de cada alta de hotel o importación.
  - Cada punto guarda la base entera, los ficheros de Storage, el `.env` y la versión de las imágenes.
- **Copia diaria** completa de la base, más el **registro continuo de cambios** (archivado de WAL con `pgBackRest`). Con él se puede volver a cualquier minuto de los últimos días, lo más parecido al PITR de Supabase.
- **Retención local**: 7 días de registro continuo, 7 copias diarias y los 5 últimos puntos de restauración. Si el disco pasa del 80 %, avisa antes de borrar nada.
- **Órdenes:**
  - `melendos rollback`: vuelve a la versión anterior y a los datos del último punto.
  - `melendos restore --at "2026-10-02 14:30"`: vuelve a un minuto concreto.
  - `melendos restore --point <id>`: vuelve a un punto de restauración concreto.
  - Las tres piden confirmación y crean antes un punto con el estado actual, por si hay que deshacer la vuelta atrás.

### Además, una copia fuera del VPS (recomendado)

Una copia que solo está en el VPS se pierde con el VPS: el proveedor falla o lo borra, alguien entra y cifra el disco, o se acaba el espacio. Por eso propongo mantener también una copia diaria fuera:

- `restic` hacia un almacenamiento S3 compatible de la UE (Backblaze B2, Hetzner Storage Box, OVH Object Storage);
- cifrada con una clave que guardamos nosotros y el cliente;
- retención de 14 diarias, 8 semanales y 12 mensuales.

Las vueltas atrás del día a día salen de la copia local; la de fuera es para desastres.

### Siempre

- **Simulacro de restauración** en un VPS limpio antes de dar la instalación por buena, y después cada trimestre. Sin simulacro, la copia no cuenta.
- **Vault**: las credenciales de pasarelas, SES y el certificado de VERI\*FACTU están cifradas con una clave de la instalación. La copia de la base no sirve sin esa clave; el instalador la guarda en el `.env` y cada copia la incluye, cifrada.

## 9. Seguridad y operación

- **Cortafuegos** (`ufw`):
  - solo 22, 80 y 443 abiertos;
  - SSH solo con clave, sin contraseña, y `fail2ban`;
  - Postgres, Studio y Kong de administración nunca expuestos.
- **Actualizaciones**: `unattended-upgrades` para el sistema. Las del producto, con `melendos update`, previo aviso al cliente.
- **Secretos**: el `.env` con permisos `600`. En los registros no aparecen claves ni datos de huéspedes.
- **Seguimiento**: `melendos doctor` cada hora con un temporizador. Si algo falla, avisa a soporte por email o webhook; es la versión autoalojada de `ops_alerts`. Opcional: un latido hacia el panel de gestión de `site/` para ver el estado de cada instalación.
- **Responsabilidades (RGPD):**
  - Si el VPS es del cliente, el cliente es responsable del tratamiento y del servidor; nosotros somos encargados cuando entramos a dar soporte.
  - Si el VPS es nuestro, somos encargados y el proveedor del VPS, subencargado.
  - Hay que reflejarlo en el contrato; ya estaba pendiente mencionar el acceso de soporte.

## 10. Prueba con un VPS

Objetivo: instalar desde cero en un VPS nuevo, dejar un hotel funcionando como en producción y medir lo que cuesta.

Esta es la prueba del instalador terminado, sobre un VPS limpio. Antes va la instalación a mano con bitácora (sección 1), en otro VPS o en el mismo, reinstalado.

**Preparación** (antes de contratar el VPS):

1. Hacer los cambios de la sección 4, el paquete de la sección 5 y el asistente de la sección 6, con su PR y su CI.
2. Elegir el proveedor y un dominio de pruebas; por ejemplo, subdominios de `melendo.app`.

**Día de la prueba:**

| Paso | Qué                                                                                                                                                      | Se da por bueno si…                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1    | VPS Ubuntu 24.04, 4 vCPU/8 GB, en la UE. DNS de `panel`, `reservas` y `api` apuntando a él                                                               | Resuelven                                                                                               |
| 2    | **Asistente de alta** desde el panel de gestión, con la IP y la contraseña de un solo uso                                                                | Termina solo en menos de 30 min, con HTTPS válido en los tres nombres y el cliente apuntado en el panel |
| 3    | El mismo asistente da de alta un hotel ficticio con un CSV de habitaciones y otro de reservas                                                            | Llega la invitación a dirección, entra con 2FA y ve sus habitaciones y reservas importadas              |
| 4    | `melendos doctor`                                                                                                                                        | Sin bloqueantes (salvo los esperados de una prueba: pagos y normativa en modo pruebas)                  |
| 5    | Reserva con pago en el entorno de pruebas de Redsys                                                                                                      | La notificación de Redsys llega a `api.` y confirma la reserva; llega el email al huésped               |
| 6    | Check-in con viajeros, SES en modo simulado, factura VERI\*FACTU simulada, chat, emails                                                                  | Las colas se vacían solas (cron)                                                                        |
| 7    | `scripts/e2e-*.mjs` y `smoke.mjs` apuntando al VPS                                                                                                       | Todo en verde                                                                                           |
| 8    | Dominio propio de prueba (CNAME) para la web del hotel                                                                                                   | Caddy emite el certificado solo; un dominio no dado de alta no obtiene certificado                      |
| 9    | **Vuelta atrás local**: borrar un hotel a propósito y `melendos restore --at` al minuto anterior; después, restaurar la copia de fuera en un segundo VPS | Vuelve todo como estaba; el segundo VPS arranca con los mismos datos y Vault funciona                   |
| 10   | Actualizar a una versión nueva desde el asistente (aunque solo cambie un texto) y `melendos rollback`                                                    | Sin corte apreciable; el rollback deja la versión y los datos de antes                                  |
| 11   | Medir: RAM, CPU y disco en reposo y con uso; tiempos de respuesta                                                                                        | Se decide el tamaño mínimo y el precio del alojamiento                                                  |
| 12   | Segundo hotel en la misma instalación, desde el asistente (uso 2)                                                                                        | Solo hace el alta, con su punto de restauración previo                                                  |
| 13   | Borrar los dos VPS                                                                                                                                       | Sin restos de datos                                                                                     |

**Qué sale de la prueba:**

- una guía de instalación corta en `docs/`, para nosotros y para el informático de un cliente;
- el tamaño de servidor recomendado;
- el coste mensual;
- la lista de ajustes del paquete.

## 11. Esfuerzo estimado

| Bloque                                                                            | Días      |
| --------------------------------------------------------------------------------- | --------- |
| Configuración en tiempo de ejecución del frontend (4.1)                           | 0,5       |
| Funciones en `edge-runtime` autoalojado y secretos (4.2, 4.3)                     | 1–2       |
| Scripts de cron, `prod-check` autoalojado, alertas y lake (4.4–4.6)               | 1–1,5     |
| `docker-compose`, imágenes y publicación en GHCR desde la CI                      | 1,5       |
| Comando `melendos` (install, update, rollback, restore, doctor, support)          | 2         |
| Instalación a mano con bitácora (sección 1)                                       | 2–3       |
| Copias locales con puntos de restauración y registro continuo (sección 8)         | 1,5       |
| Asistente en el panel de gestión: formulario, validación de CSV, estado por pasos | 2         |
| Orquestador (workflow que ejecuta los pasos por SSH, reanudable)                  | 2         |
| Caddy con _on-demand TLS_ y comprobación de dominios                              | 0,5       |
| Prueba con el VPS (sección 9) y guía final                                        | 1,5–2     |
| **Total**                                                                         | **16–19** |

## 12. Riesgos

- **Funciones con `deno.json` propio en `edge-runtime` autoalojado.** Es lo menos probado. Si da guerra, la salida es empaquetar cada función con sus dependencias (`deno bundle`/`esbuild`) en la CI.
- **Certificado de cliente de VERI\*FACTU (TLS mutuo) desde `edge-runtime`.** Ya estaba pendiente de verificar en la nube; en el VPS se puede comprobar con más control.
- **Recursos**: Supabase autoalojado completo es pesado. Si 8 GB se quedan cortos se pueden apagar piezas que no usamos: `analytics`/`vector`, que son los registros de Supabase Studio, e `imgproxy` si no transformamos imágenes.
- **Actualizaciones de Supabase autoalojado**: hay que fijar versiones y probarlas en la demo, igual que las migraciones.
- **Operación**: cada instalación dedicada es un servidor más que mantener. Conviene cobrar la implantación y un mantenimiento, y limitar las dedicadas a clientes que lo necesiten. El resto, en nuestra nube multi-hotel.

## 13. Decisiones para Dan

1. **Modelo** (decidido el 30/09): varios clientes por VPS, hasta 10, cada uno con su instalación independiente (sección 3, «Varios hoteles por VPS»).
2. **Quién contrata el VPS**:
   - ¿El cliente (su servidor, nosotros con acceso de soporte) o nosotros (se lo repercutimos)?
   - Cambia el contrato y el reparto RGPD.
3. **Precio**: implantación dedicada y mantenimiento mensual, fuera de la tarifa por habitación de `site/PRICING.md`.
4. **Actualizaciones**:
   - ¿Las lanzamos nosotros (con acceso SSH) o el cliente con `melendos update`?
   - Propuesta: nosotros, en una ventana acordada.
5. **Proveedor**: propuesta, OVH o netcup (sección 3, «Coste y rentabilidad»); Hetzner Cloud ha dejado de ser barato tras las subidas de 2026. Para la prueba a mano, un OVH VPS-3 (~20 €/mes) basta.
6. **VPS para la instalación a mano**: propuesta, un OVH VPS-3 (8 vCore, 24 GB, 200 GB, ~20 €/mes) con Ubuntu 24.04 y acceso de administrador; así ya se prueban varias instalaciones en el mismo VPS. Además, y tres nombres de un dominio de pruebas apuntando a él (por ejemplo `panel-prueba`, `reservas-prueba` y `api-prueba` de `melendo.app`).
7. **Copia fuera del VPS**: las copias van en el VPS, como pediste. ¿Añadimos también la copia diaria fuera (sección 8)? Recomiendo que sí: sin ella, perder el VPS es perderlo todo.
8. **Orquestador**: propuesta, un workflow de GitHub Actions lanzado desde el panel de gestión; un servicio propio solo si hay muchas altas.
9. **Credenciales del hotel** (TPV, SES, certificado): propuesta, que las meta el hotel en su panel y no pasen por el asistente.
