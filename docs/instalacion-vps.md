# Plan: Melend/OS empaquetado para instalar en un VPS

_30/09/2026. Plan de trabajo; nada de esto está construido todavía. Después se hará una prueba con un VPS real (sección 9)._

## 1. Objetivo

Instalar Melend/OS completo en un servidor (un VPS) con un solo instalador y actualizarlo con un solo comando. Hoy el producto vive en dos servicios gestionados: el frontend en un hosting estático y el backend en Supabase Cloud. El paquete tiene que servir para dos casos con el mismo código:

- **Instalación dedicada para un cliente**: un hotel o una cadena que quiere sus datos en su propio servidor.
- **Nuestra propia nube en VPS**: varios hoteles en una instalación, como alternativa a Supabase Cloud, si sale más barato o nos da más control.

La app ya es multi-hotel, así que los dos casos son la misma instalación con uno o con varios hoteles dados de alta. Se mantiene la regla de siempre: **entre entornos solo cambia la configuración, nunca el código.**

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

- **Mínimo razonable**: 4 vCPU, 8 GB de RAM y 80 GB de SSD. Supabase autoalojado pide unos 4 GB solo para arrancar, así que con 4 GB va justo. Medirlo en la prueba.
- **Sistema**: Ubuntu 24.04 LTS, Docker Engine y el plugin de Compose.
- **Ubicación en la UE** (datos personales, SES.HOSPEDAJES): Hetzner (Alemania/Finlandia), OVH (Francia) o un proveedor español (IONOS, Arsys) si el cliente lo pide. Hay que confirmar precios en cada proveedor; en la gama de 4 vCPU/8 GB suelen rondar las decenas de euros al mes.
- **DNS**: un dominio con tres nombres apuntando al VPS (sección 6).
- **Salida a internet** hacia Redsys/Stripe, Resend, la AEAT, el Ministerio del Interior y el proveedor de IA. **Entrada** solo por los puertos 80 y 443.

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
| `melendos backup` / `melendos restore` | Ver sección 7                                                                                                                                                                        |
| `melendos doctor`                      | `prod-check` en modo autoalojado, `smoke.mjs`, espacio en disco, certificados, colas atascadas                                                                                       |
| `melendos logs [servicio]`             | Registros                                                                                                                                                                            |
| `melendos support on/off`              | Abre o cierra el acceso de soporte de Melend/OS (rol «Administrador» y clave SSH), con constancia en `audit_log`                                                                     |

Lo exclusivo de la demo queda fuera por defecto: `DEMO_ACCESS`, `seed-auth`, simulador de historial y semillas.

## 6. Cómo queda una instalación

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

## 7. Copias de seguridad

En autoalojado no hay PITR de Supabase: es lo que más cambia y hay que tratarlo como bloqueante.

- **Base de datos:**
  - `pg_dump` completo cada noche;
  - archivado continuo de WAL con `pgBackRest` o `wal-g`, para poder volver a un minuto concreto, que es lo más parecido a PITR.
- **Ficheros**: el volumen de Storage (fotos, lake) y el `.env` con los secretos, cifrado.
- **Fuera del servidor**: `restic` hacia un almacenamiento S3 compatible de la UE (Backblaze B2, Hetzner Storage Box, OVH Object Storage), cifrado con una clave que guardamos nosotros y el cliente.
- **Retención**: 14 diarias, 8 semanales y 12 mensuales. Ajustable.
- **Simulacro de restauración** en un VPS limpio antes de dar la instalación por buena, y después cada trimestre. Sin simulacro, la copia no cuenta.

Ojo con Vault: las credenciales de pasarelas, SES y el certificado de VERI\*FACTU están cifradas con una clave de la instalación. La copia de la base no sirve sin esa clave; el instalador la guarda en el `.env` y la copia cifrada la incluye.

## 8. Seguridad y operación

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

## 9. Prueba con un VPS

Objetivo: instalar desde cero en un VPS nuevo, dejar un hotel funcionando como en producción y medir lo que cuesta.

**Preparación** (antes de contratar el VPS):

1. Hacer los cambios de la sección 4 y el paquete de la sección 5, con su PR y su CI.
2. Elegir el proveedor y un dominio de pruebas; por ejemplo, subdominios de `melendo.app`.

**Día de la prueba:**

| Paso | Qué                                                                                               | Se da por bueno si…                                                                       |
| ---- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1    | VPS Ubuntu 24.04, 4 vCPU/8 GB, en la UE. DNS de `panel`, `reservas` y `api` apuntando a él        | Resuelven                                                                                 |
| 2    | `melendos install`                                                                                | Termina solo en menos de 20 min y con HTTPS válido en los tres nombres                    |
| 3    | `melendos hotel add` con un hotel ficticio (`scripts/hotel.example.json`) y `melendos support on` | Llega la invitación a dirección y entra con 2FA                                           |
| 4    | `melendos doctor`                                                                                 | Sin bloqueantes (salvo los esperados de una prueba: pagos y normativa en modo pruebas)    |
| 5    | Reserva con pago en el entorno de pruebas de Redsys                                               | La notificación de Redsys llega a `api.` y confirma la reserva; llega el email al huésped |
| 6    | Check-in con viajeros, SES en modo simulado, factura VERI\*FACTU simulada, chat, emails           | Las colas se vacían solas (cron)                                                          |
| 7    | `scripts/e2e-*.mjs` y `smoke.mjs` apuntando al VPS                                                | Todo en verde                                                                             |
| 8    | Dominio propio de prueba (CNAME) para la web del hotel                                            | Caddy emite el certificado solo; un dominio no dado de alta no obtiene certificado        |
| 9    | Copia de seguridad y **restauración en un segundo VPS**                                           | El segundo VPS arranca con los mismos datos y las credenciales de Vault funcionan         |
| 10   | `melendos update` a una versión nueva (aunque solo cambie un texto)                               | Sin corte apreciable y con vuelta atrás probada                                           |
| 11   | Medir: RAM, CPU y disco en reposo y con uso; tiempos de respuesta                                 | Se decide el tamaño mínimo y el precio del alojamiento                                    |
| 12   | Borrar los dos VPS                                                                                | Sin restos de datos                                                                       |

**Qué sale de la prueba:**

- una guía de instalación corta en `docs/`, para nosotros y para el informático de un cliente;
- el tamaño de servidor recomendado;
- el coste mensual;
- la lista de ajustes del paquete.

## 10. Esfuerzo estimado

| Bloque                                                                | Días     |
| --------------------------------------------------------------------- | -------- |
| Configuración en tiempo de ejecución del frontend (4.1)               | 0,5      |
| Funciones en `edge-runtime` autoalojado y secretos (4.2, 4.3)         | 1–2      |
| Scripts de cron, `prod-check` autoalojado, alertas y lake (4.4–4.6)   | 1–1,5    |
| `docker-compose`, imágenes y publicación en GHCR desde la CI          | 1,5      |
| Comando `melendos` (install, update, backup/restore, doctor, support) | 2        |
| Caddy con _on-demand TLS_ y comprobación de dominios                  | 0,5      |
| Prueba con el VPS (sección 9) y guía final                            | 1,5–2    |
| **Total**                                                             | **8–10** |

## 11. Riesgos

- **Funciones con `deno.json` propio en `edge-runtime` autoalojado.** Es lo menos probado. Si da guerra, la salida es empaquetar cada función con sus dependencias (`deno bundle`/`esbuild`) en la CI.
- **Certificado de cliente de VERI\*FACTU (TLS mutuo) desde `edge-runtime`.** Ya estaba pendiente de verificar en la nube; en el VPS se puede comprobar con más control.
- **Recursos**: Supabase autoalojado completo es pesado. Si 8 GB se quedan cortos se pueden apagar piezas que no usamos: `analytics`/`vector`, que son los registros de Supabase Studio, e `imgproxy` si no transformamos imágenes.
- **Actualizaciones de Supabase autoalojado**: hay que fijar versiones y probarlas en la demo, igual que las migraciones.
- **Operación**: cada instalación dedicada es un servidor más que mantener. Conviene cobrar la implantación y un mantenimiento, y limitar las dedicadas a clientes que lo necesiten. El resto, en nuestra nube multi-hotel.

## 12. Decisiones para Dan

1. **Modelo**:
   - ¿Solo instalaciones dedicadas por cliente, o también mover nuestra nube multi-hotel a VPS?
   - Propuesta: el paquete sirve para ambas; se decide por cliente.
2. **Quién contrata el VPS**:
   - ¿El cliente (su servidor, nosotros con acceso de soporte) o nosotros (se lo repercutimos)?
   - Cambia el contrato y el reparto RGPD.
3. **Precio**: implantación dedicada y mantenimiento mensual, fuera de la tarifa por habitación de `site/PRICING.md`.
4. **Actualizaciones**:
   - ¿Las lanzamos nosotros (con acceso SSH) o el cliente con `melendos update`?
   - Propuesta: nosotros, en una ventana acordada.
5. **Proveedor para la prueba**: propuesta, Hetzner (barato, UE, API para automatizar); o uno español si algún cliente lo va a pedir.
