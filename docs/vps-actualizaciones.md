# Actualizar las instalaciones en VPS

Cómo llega un arreglo o una versión nueva a todas las instalaciones sin entrar en cada VPS. Decidido con Dan el 30/09/2026: **las lanza Dan** y **las sube GitHub**; el repositorio sigue privado.

## En dos pasos

1. **Publicar la versión.** Desde `main`, con la CI en verde:

   ```sh
   git tag v0.2.0 && git push origin v0.2.0
   ```

   El flujo **Release (VPS bundle)** comprueba que el commit está en `main` y que su CI pasó. Después genera el paquete con `deploy/vps/bundle.sh` y lo adjunta a una Release privada del repositorio. El paquete lleva:
   - la web compilada una sola vez, sin ningún proyecto dentro, porque cada instalación pone su `config.js`;
   - las funciones con el enrutador del VPS;
   - las migraciones;
   - los ficheros de `deploy/vps`;
   - el propio comando `melendos`.

2. **Instalarla.** GitHub → Actions → **Publish to VPS** → _Run workflow_, con dos datos:
   - `version`: el tag, por ejemplo `v0.2.0`.
   - `targets`: `all` para todas las instalaciones, o una lista como `ovh-waw-1:prueba` o `ovh-waw-1`.

   El flujo recorre el inventario **en su orden, una instalación cada vez**, y **se para en el primer fallo**. En el inventario la instalación de prueba va la primera, así que hace de canario.

## Qué hace `melendos update` en cada instalación

1. **Punto de restauración:** un `pg_dump` en `backups/`. Se guardan los 2 últimos.
2. **Migraciones pendientes:** cada una en su transacción, apuntada en `supabase_migrations.schema_migrations` como hace la CLI de Supabase. Si una falla, se deshace esa y la actualización se para.
3. **Cambio de versión:** `web` y `functions` son enlaces a `/opt/melendos/releases/<versión>/`. Se cambian de golpe, se reinicia el contenedor de funciones y, si el paquete trae otro override de compose, se aplica.
4. **Prueba de humo:**
   - cada función arranca (una petición GET a cada una: sin efectos y con respuesta propia; `BOOT_ERROR` si no compila);
   - `price-calendar` responde;
   - la API y Auth responden;
   - el panel sirve la web y su `config.js`.
5. **Si la prueba de humo falla, vuelve sola a la versión anterior** y el flujo se para.

Probado el 30/09/2026 en la instalación `prueba`:

| Caso                                      | Resultado                        |
| ----------------------------------------- | -------------------------------- |
| Versión con una migración                 | Aplicada y registrada            |
| Versión con una función que no compila    | Detectada y vuelta atrás en 26 s |
| Versión a la que le falta una función     | Detectada y vuelta atrás en 20 s |
| Volver atrás a mano (`melendos rollback`) | Funciona                         |

## Reglas para programar

- **Las migraciones tienen que funcionar con la versión anterior.** La vuelta atrás automática solo cambia el código; la base se queda como está. Para quitar una columna o una función SQL:
  1. Una versión deja de usarla.
  2. La siguiente la borra.
- Toda función nueva tiene que responder a un GET sin hacer nada (lo normal: `405`), porque la prueba de humo las llama así.
- Lo que cambie entre instalaciones va en su `.env`, `functions.env` o `config.js`, nunca en el paquete.

## En el VPS

```sh
melendos status                                  # versión de cada instalación y la anterior
melendos update /ruta/melendos-v0.2.0.tar.gz     # a mano, todas o las que se indiquen
melendos rollback prueba                         # volver a la versión anterior (solo el código)
```

- **Restaurar la base** desde un punto de restauración es, de momento, manual: `pg_restore` del fichero de `backups/`. Irá al comando `melendos` junto con las copias al NAS.
- Se guardan las últimas 4 versiones, más las que estén en uso o sean la anterior de alguna instalación.

## Secretos del repositorio

| Secreto           | Qué es                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VPS_SSH_KEY`     | Clave privada de despliegue de GitHub. Es distinta de la de Dan; su pública, `deploy/vps/github-deploy.pub`, va en el `authorized_keys` de cada VPS |
| `VPS_KNOWN_HOSTS` | Huellas SSH de los VPS (`ssh-keyscan`)                                                                                                              |
| `VPS_INVENTORY`   | Una línea por VPS: `<nombre> <usuario@host> <instalación> [instalación…]`                                                                           |

**Al añadir un VPS:**

1. Pon la clave pública de despliegue en su `authorized_keys`.
2. Añade su huella a `VPS_KNOWN_HOSTS`.
3. Añade su línea a `VPS_INVENTORY`.

**Al añadir una instalación:** súmala a la línea de su VPS.
