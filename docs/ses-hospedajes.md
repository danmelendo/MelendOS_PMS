# Registro de viajeros (SES.HOSPEDAJES)

El Real Decreto 933/2021 obliga a los alojamientos a comunicar al Ministerio del Interior, en menos de 24 horas:

- **RH, reserva de hospedaje**: cada reserva cuando se hace, se modifica o se anula.
- **PV, parte de viajeros**: cada huésped que se aloja, al hacer la entrada.

El PMS prepara, valida, envía y sigue esas comunicaciones por el servicio web del ministerio. La recepción solo interviene para registrar a los huéspedes y para revisar lo que el ministerio rechace.

Fuentes: _Interfaz servicios externos. Servicio de Comunicación Hospedajes_ v3.1.2 (SGTIC, 17/09/2024) y _Instrucciones para el alta masiva de comunicaciones_ v1.1.0, que recogen las tablas de códigos. El formato (espacios de nombres y orden de los elementos) sigue los XSD del ministerio.

## Flujo

```
reservations ──trigger──▶ ses_communications (cola, con plazo de 24 h)
                               │  cada 10 min (pg_cron → ses_dispatch_tick → pg_net)
                               │  o «Enviar ahora» en el panel
                               ▼
                        ses-dispatch (Edge Function)
                          1. consulta los lotes enviados (operación C) → código o error
                          2. construye lo pendiente con los datos actuales,
                             lo valida (@domain/ses.ts), ZIP + Base64, SOAP (A / B)
                               ▼
                 hospedajes.ses.mir.es (prod) · hospedajes.pre-ses.mir.es (pruebas)
```

| Evento de la reserva                                    | Qué se encola                                       |
| ------------------------------------------------------- | --------------------------------------------------- |
| Pasa a confirmada (o se crea confirmada)                | RH «A»                                              |
| Cambian fechas o personas después de comunicarla        | RH «B» (anula la anterior) + RH «A» nueva           |
| Se cancela o se rechaza                                 | Lo no enviado queda «No necesaria»; lo enviado, «B» |
| Entrada (`in_progress`)                                 | PV «A»                                              |
| Reserva simulada (`simulated`) u hotel sin el registro | Nada                                                |

Estados de una comunicación: `pending` (por enviar), `blocked` (faltan datos: el error dice cuáles; se reintenta en cada pasada y al guardar un viajero), `sent` (en un lote, esperando al ministerio), `accepted` (con `ses_code`), `rejected` (el ministerio la rechazó: «Reenviar» tras corregir), `error` (no se pudo enviar; hasta 5 intentos), `skipped`, `cancelled`.

## Datos de los huéspedes

`stay_travellers`: un registro por persona y estancia, con los campos que pide el ministerio. **No tiene políticas RLS**: se escribe con `save_stay_traveller` (recepción o dirección del hotel) y la recepción solo ve `list_stay_travellers`: nombre, documento enmascarado (`••••••78Z`), si es menor y qué falta. Los datos completos solo los lee el servidor al enviar. Al corregir a un viajero, los campos que no se envían se conservan.

Reglas (`travellerIssues` en `@domain/ses.ts`, espejo de los campos obligatorios en SQL `ses_traveller_missing`, con test de paridad):

- Todos: nombre, primer apellido, fecha de nacimiento, domicilio (en España con el código de municipio del INE; fuera, la ciudad) y un teléfono o email.
- Mayores de edad: tipo y número de documento. Con DNI (NIF), también el segundo apellido. Con DNI o NIE, el número de soporte. Se comprueba la letra del DNI y del NIE.
- Menores: el parentesco con un adulto del grupo. Un menor no puede alojarse sin un adulto.
- El parte incluye a todas las personas de la reserva (`people`).
- La reserva (RH) solo necesita al titular: nombre, apellido y contacto. Sale del registro si la recepción lo tiene, o de la ficha del cliente (el nombre se separa en nombre y apellidos).

Tipo de pago: `PLATF` (pago online o canal) o `DESTI` (en el hotel). No se envían datos de tarjeta.

## Configuración por hotel

Panel → «Registro de viajeros» → Configuración (solo dirección):

- Activar el registro y elegir entorno: **Simulado** (el PMS construye y valida todo como para el ministerio, pero no lo envía; es el de la demo), **Pruebas del ministerio** o **Producción**.
- Código de arrendador y código de establecimiento de cada hotel: los da la Sede Electrónica al registrar la empresa y los establecimientos.
- Usuario y contraseña del servicio web (y, si el ministerio lo pide, su certificado en PEM). Se guardan en Vault (`ses/<tenant>`) y solo los lee el servidor.

Instalar el envío programado en un proyecto (demo o producción), una vez:

```sh
set -a; . ./.env; set +a; node scripts/ses-setup.mjs
```

Genera una clave aleatoria, la guarda como secreto de la función (`SES_CRON_KEY`) y en Vault (`ses/cron_url`, `ses/cron_key`). Volver a ejecutarlo rota la clave.

## Pruebas

- Unitarias: `supabase/functions/_shared/domain/ses.test.ts` (reglas, DNI/NIE, países) y `supabase/functions/_shared/ses/ses.test.ts` (XML, respuestas de los anexos, ZIP descomprimido con zlib, dispatcher).
- Base de datos: bloque «traveller register» de `supabase/tests/rls.test.ts`.
- De extremo a extremo contra la demo (entorno simulado): `node --env-file=.env scripts/e2e-ses.mjs`.

## Pendiente

- Probar contra el entorno de pruebas del ministerio con credenciales reales: hace falta dar de alta una entidad en la Sede Electrónica.
- Que el huésped rellene sus datos en el check-in online (`/web/sign`), con el mismo formulario y enlace con token.
- Buscador de municipios del INE (ahora se escribe el código de 5 cifras).
- Anular un parte ya enviado si se corrige después de la entrada (hoy: anular a mano en la Sede y «Reenviar»).
