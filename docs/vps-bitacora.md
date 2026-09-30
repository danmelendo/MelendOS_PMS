# Bitácora: instalación a mano en un VPS

Registro de la primera instalación de Melend/OS en un VPS real, hecha a mano siguiendo `docs/instalacion-vps.md`. De aquí salen el instalador y el asistente de alta: cada paso que funcione se convierte en un paso del instalador, y cada error, en una comprobación previa o en un arreglo automático.

Lo que se usó está en `deploy/vps/`: `instance/` (lo que se añade al compose oficial de Supabase en cada instalación), `proxy/` (el Caddy compartido del VPS) y `tools/cron-setup.mjs` (tareas programadas).

## Datos de la prueba

| Qué                   | Valor                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fecha                 | 30/09/2026                                                                                                                                                           |
| Proveedor y ubicación | OVH VPS-1, Varsovia (Polonia). En Francia no había stock; Reino Unido se descartó (fuera de la UE)                                                                   |
| Tamaño                | 2 vCores, 4 GB de RAM (3,8 útiles), 40 GB NVMe (38 útiles)                                                                                                           |
| Sistema               | Ubuntu 24.04.4 LTS, kernel 6.8                                                                                                                                       |
| Nombres               | `panel-prueba`, `reservas-prueba` y `api-prueba` en `melendo.app` (registros A al VPS)                                                                               |
| Versión de Melend/OS  | `main` en f8c78dd                                                                                                                                                    |
| Versiones de Supabase | compose oficial `self-hosted/v0.8.2`: postgres 17.6.1.136, gotrue 2.196.0, postgrest 14.17, realtime 2.134.10, storage-api 1.74.0, edge-runtime 1.76.2, envoy 1.39.1 |
| Docker                | Engine 29.8.1, Compose 5.5.1; Caddy 2                                                                                                                                |

Ninguna contraseña ni clave se apunta aquí. Acceso: clave SSH `~/.ssh/melendos_vps` en el equipo de Dan (alias `melendos-vps`); contraseña del usuario `ubuntu` solo para la consola KVM de OVH, en el gestor de contraseñas de Dan. Secretos de la instalación: `/opt/melendos/instances/prueba/.env` y `functions.env` (permisos 600).

## Pasos

### 1. Primer acceso

- Órdenes: `ssh-keygen -t ed25519` (clave propia para el VPS); entrada con la contraseña que envía OVH para instalar la clave pública.
- Tiempo: 5 min.
- Resultado: bien tras un error.
- Error: `You are required to change your password immediately (administrator enforced)` y `Password change required but no TTY available`. OVH da la contraseña caducada y obliga a cambiarla en el primer acceso, que tiene que ser interactivo.
- Arreglo: cambio con una sesión con terminal (paramiko con `invoke_shell`) por una contraseña aleatoria de 20 caracteres, y después la clave en `authorized_keys`.
- Para el instalador: el asistente recibe IP + contraseña de un solo uso; tiene que resolver este cambio forzado (sesión con terminal), instalar su clave y no volver a usar la contraseña.

### 2. Asegurar el servidor

- Órdenes: `apt-get full-upgrade`; `ufw` (entrada solo 22, 80, 443/tcp y 443/udp); `fail2ban` para SSH (5 intentos, 1 h); `unattended-upgrades` (ya venía activo); SSH solo con clave, sin root, `MaxAuthTries 3`; 3 GB de swap con `vm.swappiness=10`; reinicio por kernel nuevo.
- Tiempo: 2 min de actualización + 1 min de reinicio.
- Resultado: bien tras un error.
- Error: `PasswordAuthentication no` en `sshd_config` no bastaba: `/etc/ssh/sshd_config.d/50-cloud-init.conf` (de la imagen de OVH) pone `PasswordAuthentication yes`, y en `sshd` gana el primer valor leído.
- Arreglo: `/etc/ssh/sshd_config.d/01-melendos.conf`, que se lee antes. Comprobado con `sshd -T` y con un intento real por contraseña (`Permission denied (publickey)`).
- Para el instalador: poner la configuración en `01-…` y verificar con `sshd -T` y un intento por contraseña antes de cerrar la sesión.

### 3. Docker

- Órdenes: repositorio oficial de Docker, `docker-ce`, `docker-compose-plugin`; registros de contenedores con rotación (`log-driver local`, 10 MB × 3).
- Tiempo: 22 s.
- Resultado: bien.

### 4. Compose oficial de Supabase

- Órdenes: `setup.sh -y --skip-deps --project-dir prueba` del repositorio de Supabase (toma la última versión publicada, `self-hosted/v0.8.2`, no la rama en desarrollo). Genera todos los secretos: contraseña de Postgres, secreto JWT, claves `anon`/`service_role`, claves nuevas `sb_publishable_…`/`sb_secret_…` y las asimétricas.
- Tiempo: 3 min (casi todo, descargar imágenes).
- Resultado: bien, con dos sorpresas:
  - La pasarela ya no es Kong sino **Envoy** (Kong queda como opción). El plan decía Kong; no cambia nada para nosotros.
  - Las imágenes ocupan **8,9 GB**, no 3–4. Sin Studio, meta, supavisor e imgproxy quedan **5,2 GB**, compartidos por todas las instalaciones del VPS.
- Para el instalador: fijar la versión del compose (`--ref self-hosted/vX.Y.Z`) y probar cada subida antes de usarla.

### 5. Adaptarlo a Melend/OS (`deploy/vps/instance/docker-compose.override.yml`)

- Fuera Studio, meta, imgproxy y supavisor (`profiles: [disabled]`), sin transformación de imágenes en storage.
- **Ningún puerto publicado**. El compose oficial publica 8000 (pasarela) y 5432/6543 (supavisor) en todas las interfaces, y **Docker se salta `ufw`**: estarían abiertos a internet con el cortafuegos activo. Caddy llega a la pasarela por la red `melendos-edge`; Postgres, solo en `127.0.0.1` para las migraciones por túnel. Comprobado desde fuera: 5432, 54322, 8000, 6543 y 4000 cerrados.
- **Nombres de contenedor por instalación**. El compose oficial los fija (`supabase-db`…) y una segunda instalación en el mismo VPS chocaría. Ahora son `<instalación>-db`, etc., y el proyecto se llama `melendos-<instalación>` (`COMPOSE_PROJECT_NAME`). Realtime conserva su nombre de red `realtime-dev.supabase-realtime` como alias, porque de ahí saca su tenant.
- TOTP activado en Auth (la 2FA del personal).
- Error: al cambiar el nombre del proyecto a mitad, el volumen `db-config` (clave de pgsodium) es otro. Se borró la base, que aún estaba vacía, y se empezó de cero. Para el instalador: el nombre del proyecto se fija antes del primer arranque y no se cambia.

### 6. Migraciones

- Órdenes: túnel `ssh -L 54322:127.0.0.1:54322` y `supabase db push --db-url "postgresql://postgres:…@127.0.0.1:54322/postgres?sslmode=disable"`.
- Tiempo: 8 s para las 56 migraciones.
- Resultado: bien tras dos errores.
- Error 1: `tls error (The server does not support SSL connections)`. El Postgres autoalojado no tiene TLS; por el túnel no hace falta. Arreglo: `sslmode=disable`.
- Error 2: `relation "storage.buckets" does not exist` en la migración del lake. Las tablas de `storage` (y las de `auth`) las crean esos servicios en su primer arranque. Arreglo: arrancar toda la pila antes de migrar. La migración fallida se deshizo sola (cada una va en su transacción) y el segundo `db push` siguió desde ahí.
- Para el instalador: orden fijo, arrancar todo, esperar a que storage y auth estén sanos y después migrar.

### 7. Funciones

- Las funciones del repo (sin tests) en `functions/` de la instalación, más el enrutador `main`.
- El enrutador oficial usa un único mapa de imports para todas; las nuestras llevan el suyo (`deno.json` con zod y el SDK de MCP). Arreglo: `deploy/vps/instance/functions-main/index.ts` usa el `deno.json` de cada función si existe.
- Verificación de JWT global desactivada (ya venía así en el compose): cada función comprueba la sesión, como en la nube.
- Secretos en `functions.env` (600): `PUBLIC_WEB_URL`, `PANEL_URL`, `APP_ORIGINS` y las claves de las tareas programadas.

### 8. Tareas programadas

- `pg_cron` ya trae las 8 tareas desde las migraciones. Faltaban las URL y claves en Vault que en la nube ponen `scripts/*-setup.mjs` con `supabase secrets set`, que aquí no existe.
- Arreglo: `deploy/vps/tools/cron-setup.mjs`. Genera las 4 claves (SES, VERI\*FACTU, emails y canales), las guarda en Vault con la **URL interna** (`http://api-gw:8000/functions/v1/…`: la base llama a las funciones sin salir a internet) y las escribe en `functions.env`.
- Comprobado: `net.http_post` desde la base → `guest-emails-dispatch` responde 200.

### 9. Caddy compartido y web

- `deploy/vps/proxy/`: un Caddy para todo el VPS, un fichero por instalación en `sites/`. Sirve `web/` de cada instalación (SPA) y pasa `api-…` a la pasarela.
- La web se compiló en local con `VITE_SUPABASE_URL=https://api-prueba.melendo.app`, la clave `sb_publishable_…` de la instalación y `VITE_DEMO_ACCESS=false`, y se subió a `web/`.
- Certificados de Let's Encrypt para los tres nombres en 6 s.
- Para el instalador: sigue pendiente el punto 4.1 del plan (configuración en tiempo de ejecución). Hoy hay que compilar la web para cada instalación.

### 10. Alta de un hotel

- `scripts/create-hotel.ts scripts/hotel.example.json --apply` contra la instalación (túnel + clave `sb_secret_…`): hotel, 6 habitaciones y 3 tarifas en 2,5 s.
- Error: `Error sending invite email`. Auth no tiene SMTP.
- Arreglo provisional: cuentas de dirección y recepción creadas con la API de administración y su rol en `tenant_members`.
- Para el instalador: el SMTP (Resend, dominio verificado) es obligatorio antes de dar de alta hoteles; `melendos doctor` lo comprueba.

### 11. Prueba de uso

- Panel: entrada como dirección, planning con las 6 habitaciones, sin errores en la consola.
- Web: portada, ficha del hotel con precios (fin de semana aplicado), habitación, reserva con pago en el hotel → confirmada (`0C3A88AF`). La cola de emails procesó la confirmación y la invitación al check-in en el minuto siguiente (en modo simulado, porque no hay `RESEND_API_KEY`).

## Errores encontrados

| #   | Paso | Error                                         | Causa                                                    | Arreglo                                          | Instalador                                         |
| --- | ---- | --------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| 1   | 1    | Cambio de contraseña obligatorio sin terminal | OVH entrega la contraseña caducada                       | Sesión con terminal, contraseña aleatoria, clave | Resolverlo solo con la contraseña de un solo uso   |
| 2   | 2    | SSH seguía aceptando contraseña               | `50-cloud-init.conf` gana a `sshd_config`                | `01-melendos.conf`                               | Verificar con `sshd -T` y un intento real          |
| 3   | 5    | Puertos de Postgres y pasarela abiertos       | Docker publica saltándose `ufw`                          | Sin puertos; red compartida; DB en loopback      | Comprobar desde fuera que solo hay 22, 80 y 443    |
| 4   | 5    | Nombres de contenedor fijos                   | Compose oficial pensado para una instalación por máquina | `<instalación>-<servicio>` y proyecto propio     | Nombre fijado antes del primer arranque            |
| 5   | 6    | `db push`: el servidor no admite SSL          | Postgres autoalojado sin TLS                             | `sslmode=disable` por el túnel                   | Migrar desde dentro del VPS (contenedor `migrate`) |
| 6   | 6    | `storage.buckets` no existe                   | Lo crea el servicio storage al arrancar                  | Arrancar todo antes de migrar                    | Esperar a storage y auth sanos                     |
| 7   | 7    | Imports de zod/MCP                            | El enrutador oficial usa un mapa común                   | Enrutador con `deno.json` por función            | Incluido en el paquete                             |
| 8   | 10   | Invitaciones al personal fallan               | Sin SMTP en Auth                                         | Cuentas por la API de administración             | SMTP obligatorio antes del alta de hoteles         |

## Medidas

| Qué                                     | En reposo                                           | Con uso (panel, web, reserva)                                                      |
| --------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| RAM de la instalación                   | 730 MB                                              | 1.030 MB                                                                           |
| RAM por servicio (con uso)              | —                                                   | db 236, realtime 233, funciones 215, storage 169, pasarela 76, auth 39, rest 36 MB |
| RAM del Caddy compartido                | 18 MB                                               | 44 MB                                                                              |
| RAM total del VPS                       | 1,2 GB de 3,8                                       | 1,4 GB de 3,8, sin usar swap                                                       |
| CPU                                     | < 1 %                                               | picos al compilar cada función la primera vez                                      |
| Disco del sistema                       | 11 GB de 38 (imágenes 5,2 GB)                       | —                                                                                  |
| Datos de la instalación                 | base 72 MB (esquema vacío + 1 hotel), ficheros 8 KB | —                                                                                  |
| `price-calendar` (35 días) desde España | 0,21 s, estable                                     | demo en Supabase Cloud: 0,28–1,8 s                                                 |
| Consulta REST desde España              | 0,15 s (0,05 de red)                                | demo: 0,09–0,16 s                                                                  |
| Primera llamada a una función           | 1,3 s (compila y descarga dependencias una vez)     | —                                                                                  |

Los tiempos son de `curl` desde el equipo de Dan e incluyen abrir la conexión TLS cada vez; en el navegador la conexión se reutiliza.

## Conclusiones para el instalador

1. **Caben 3 instalaciones en este VPS** (4 GB): 3 × 1 GB con uso + 0,4 GB del sistema, con 3 GB de swap de colchón. Faltan medidas con tráfico real (prueba de carga) antes de pasar de 3. Con 8 GB, unas 6–7.
2. **El disco no es el límite:** 5,2 GB de imágenes compartidas y decenas de MB por hotel. 40 GB sobran para 3 instalaciones con copias fuera (NAS).
3. **Más rápido que la nube:** el calendario de precios tarda un tercio o menos que en la demo y no tiene arranques en frío después de la primera llamada.
4. **Orden del instalador** (sale de los pasos): acceso y cambio de contraseña → asegurar (con verificaciones) → Docker → compose fijado + override → arrancar → esperar a storage/auth → migrar → funciones y `cron-setup` → SMTP → Caddy y certificados → cuenta de soporte `admin@melendo.app` (la misma en todas; su contraseña, en el gestor de Dan) → alta del hotel.
5. **Pendiente antes del instalador:** configuración de la web en tiempo de ejecución (4.1), contenedor `migrate` para no depender del túnel, SMTP, copias al NAS, `melendos doctor`.
