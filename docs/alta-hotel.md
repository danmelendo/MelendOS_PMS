# Alta de un hotel

Cómo se da de alta un hotel nuevo en Melend/OS. De momento lo hace la plataforma (nosotros) con un script, a partir de un fichero que se rellena con el hotel en la llamada de implantación. Lo demás lo configura el propio hotel desde el panel.

## 1. El fichero del hotel

Copia `scripts/hotel.example.json` y rellénalo:

| Campo                                             | Qué es                                                                                                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`                                            | Identificador corto (minúsculas, números y guiones). Da la dirección `<slug>.reservas.melendo.app`.                                                                        |
| `name`                                            | Nombre comercial.                                                                                                                                                          |
| `plan`, `packages`                                | Plan contratado (`starter`, `pro`, `group`) y, si no son los del plan, los paquetes (`stay`, `ai`, `chain`, `data`, `distribution`). Hostal: `starter` con `packages: []`. |
| `status`                                          | `trial` (prueba) o `active`.                                                                                                                                               |
| `domain`                                          | Opcional: su subdominio propio (`reservas.suhotel.com`). También se puede poner después desde el panel.                                                                    |
| `timezone`, `checkin_hour`, `checkout_hour`       | Zona horaria y horas de entrada y salida.                                                                                                                                  |
| `payment_modes`                                   | `prepay` (todo online al reservar) y/o `at_hotel` (en el hotel). El primero es el que sale marcado.                                                                        |
| `free_cancellation_hours`, `cancellation_penalty` | Cancelación gratuita hasta N horas antes y qué se cobra después (`none`, `first_night`, `full`).                                                                           |
| `brand`                                           | Color, lema, email, teléfono y dirección que muestra su web.                                                                                                               |
| `admins`, `reception`                             | Emails del personal. Reciben una invitación para elegir contraseña (o se añaden si ya tienen cuenta).                                                                      |
| `rates`                                           | Tarifas por noche (entre semana y, opcional, viernes y sábado).                                                                                                            |
| `properties[].rooms`                              | Habitaciones de cada establecimiento: nombre, capacidad, tipo (`room`, `suite`, `family`), tarifa y características.                                                       |

### Habitaciones desde el Excel del hotel

Si el hotel tiene sus habitaciones en una hoja de cálculo, no hace falta pasarlas al fichero: guarda la hoja como **CSV UTF-8** con estas columnas (en cualquier orden; mayúsculas y tildes dan igual) y pásala con `--rooms`:

| Establecimiento | Habitación | Capacidad | Tipo                          | Tarifa     | Precio | Precio fin de semana | Características |
| --------------- | ---------- | --------- | ----------------------------- | ---------- | ------ | -------------------- | --------------- |
| Hostal Ejemplo  | 1          | 1         | habitación / suite / familiar | Individual | 45     | 55                   | wifi            |

Acepta `;` o `,` como separador, coma decimal (`95,50`) y comillas. Cada tarifa tiene que tener el mismo precio en todas sus filas. Las habitaciones y tarifas de la hoja sustituyen a las del fichero; el establecimiento de cada fila tiene que existir en el fichero. Ejemplo: `scripts/habitaciones.example.csv`.

## 2. Comprobar y crear

```bash
set -a; . ./.env; set +a    # el .env del entorno donde se crea (¡comprueba cuál!)
node --env-file=.env scripts/create-hotel.ts hotel.json [--rooms habitaciones.csv]
```

Sin `--apply` comprueba el fichero y hace todo dentro de una transacción que luego deshace: si algo falla, lo dice sin haber tocado nada. Cuando todo está bien:

```bash
node --env-file=.env scripts/create-hotel.ts hotel.json --apply --app-url https://panel.melendo.app
```

`--app-url` es la dirección del panel a la que vuelve el enlace de la invitación (`/reset-password`). Tiene que estar en las _Redirect URLs_ de Auth (ver `DEPLOY.md`).

## 3. Lo que hace el hotel desde el panel

1. **Equipo**: invitar al resto del personal.
2. **Facturación → Datos fiscales**: razón social, NIF y domicilio. Salen en sus facturas y en el aviso legal de su web.
3. **Pasarela de pago**: sus credenciales de Redsys o Stripe (en Vault).
4. **Registro de viajeros**: sus credenciales de SES.HOSPEDAJES.
5. **Web y dominio**: logo, fotos, textos y, si quiere, su subdominio o el widget para su web actual.
6. **Mi cuenta**: la verificación en dos pasos (recomendada para dirección).

## Pendiente

- Importar **reservas** existentes desde Excel o CSV (las habitaciones y tarifas ya se importan).
- Alta desde una consola interna en lugar del script.
