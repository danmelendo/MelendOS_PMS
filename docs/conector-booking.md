# Conector con Booking.com

_02/10/2026. Investigación para poder vender a hostales que viven de Booking (primer caso: `clientes/hoteles-alcala/`). Sustituye a la línea «se acuerda en la implantación» del guion de demo cuando esté hecho._

## En una frase

**No podemos conectar directamente con Booking**: hace tiempo que no admite nuevos proveedores de conectividad. La vía es un **channel manager con API para PMS** que ya está certificado con Booking. Recomendación: **Channex** (marca blanca, pensado para PMS como el nuestro), con el adaptador encajado en la capa de canales que ya existe (`docs/channels.md`). Estimación: **2-3 semanas** de desarrollo y certificación.

## 1. Por qué no directamente con Booking

- El _Connectivity Partner Programme_ de Booking tiene **pausadas las integraciones con proveedores nuevos** «hasta nuevo aviso». Los que hay (Hostaway, Smoobu, STAAH, RateTiger…) están dentro desde antes.
- Aunque se reabriera, ser proveedor directo exige certificación, rendimiento mínimo y soporte continuo. Con dos personas no compensa.
- Booking **no ofrece iCal para hoteles** (solo para alojamientos tipo vivienda), así que no hay atajo «de calendario».

Conclusión: Booking siempre irá por un intermediario certificado.

## 2. Opciones

| Opción                                                                          | Cómo funciona                                                                                                                          | Coste                                                                                                                                                           | A favor                                                                                                           | En contra                                                                                                        |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Channex** (marca blanca)                                                      | Nuestro PMS habla con la API de Channex; Channex habla con Booking, Expedia, Airbnb y más de 50 OTAs. El hotel no ve la marca Channex. | **130 $/mes de plataforma + 7 $/mes por establecimiento** con algún canal activo (descuentos desde 500). Sin alta ni comisiones. Entorno de pruebas **gratis**. | Hecho para PMS. API REST JSON, webhooks, mapeo de habitaciones por API. Una sola integración abre todas las OTAs. | Coste fijo de 130 $ aunque tengamos un solo cliente. Hay que certificar la integración.                          |
| **Beds24** (el hotel tiene su cuenta)                                           | El hotel contrata Beds24 (unos 15-40 €/mes según unidades); nosotros leemos y escribimos por su API V2.                                | Lo paga el hotel. Nosotros, 0.                                                                                                                                  | Sin coste fijo para nosotros. Certificado con Booking, Airbnb y VRBO.                                             | El hotel tiene otro programa y otro proveedor. Peor experiencia, soporte a tres bandas. No escala como producto. |
| **El channel manager que ya use el hotel** (SiteMinder, Octorate, Hotelrunner…) | Integración con su API de PMS, si la tiene abierta.                                                                                    | Varía; algunos cobran a los PMS.                                                                                                                                | No cambian lo que ya funciona.                                                                                    | Una integración distinta por proveedor. Muchas APIs cerradas o de pago.                                          |

**Recomendación: Channex.** Es la única que convierte Distribución en una parte de nuestro producto y no en «otro programa más». Si el primer cliente ya usa un channel manager con API abierta, se valora como caso aislado, pero no se construye el producto sobre eso.

### Las cuentas de Channex

- Coste: 130 $ + 7 $ × establecimientos ≈ **150 $/mes con Hoteles Alcalá** (3 establecimientos), unos 140 €.
- Ingreso del paquete Distribución con 48 habitaciones: **96 €/mes** (2 €/hab, mínimo 29 €).
- **Con un solo cliente perdemos unos 45 €/mes en Distribución.** Salimos a cero hacia el **2.º-3.º cliente** con Distribución, porque desde ahí solo suman 7 $ por establecimiento.
- Channex factura los establecimientos **con algún canal activo**. Mientras desarrollamos y certificamos en pruebas no se paga.

Hay que asumirlo como inversión de arranque, o subir el mínimo de Distribución. **No recomiendo subirlo**: el precio está publicado y es la razón de que el hostal cambie.

## 3. Qué exige Channex a un PMS (certificación)

De su documentación y de su lista de pruebas de certificación:

1. **Modelo**: `property` (cada establecimiento), `room_type` (tipos de habitación con su número de unidades) y `rate_plan` (tarifas de cada tipo, con su ocupación).
2. **ARI (disponibilidad, precios y restricciones) de salida**:
   - `POST /availability`: unidades libres por tipo y fecha.
   - `POST /restrictions`: precio por tarifa y fecha, más estancia mínima, cerrado a llegadas o salidas y cerrado a la venta.
   - **Límites**: 10 peticiones de disponibilidad y 10 de precios/restricciones por minuto **y por establecimiento** (20 de ARI en total). Si se pasa, devuelve `429`.
   - Exigen **detectar los cambios en el momento** (sin sondeo) y **mandar solo lo que cambia**, agrupado por rangos de fechas. Además, una **sincronización completa** al conectar, con el horizonte que fije Channex (hay que confirmar los días en su documentación; se suele hablar de más de un año).
3. **Reservas de entrada**:
   - Un _webhook_ avisa de una reserva nueva, modificada o cancelada (`booking_revisions`).
   - El PMS **lee la revisión** (`GET /booking_revisions/{id}`), la **guarda** y después la **confirma** (`POST /booking_revisions/{id}/ack`). Sin el _ack_, Channex la vuelve a ofrecer en `/booking_revisions/feed`.
   - El _ack_ es **obligatorio** para certificar.
4. **Mapeo con Booking**: el hotel autoriza a Channex en el extranet de Booking (código de proveedor) y se emparejan sus habitaciones y tarifas de Booking con las nuestras. Channex tiene API y un _iframe_ para hacerlo dentro de nuestro panel.
5. **Pruebas de certificación**: una batería de casos (actualización completa, cambios de un día, de un rango, varias tarifas, restricciones, recepción y _ack_ de reservas, modificación, cancelación). Se pasan en el entorno de pruebas y Channex los revisa.

## 4. Cómo encaja en lo que ya tenemos

La capa de canales (`supabase/functions/_shared/channels/`) ya hace casi todo lo que no depende del proveedor: la cola de salida (`channel_outbox`, rellenada por _triggers_), el registro de mensajes, la idempotencia por `external_ref`, el mapeo `room_map` y la asignación de habitación libre del tipo. Falta:

| Pieza                                              | Qué hacer                                                                                                                                                                                                                                                                                                                                               | Esfuerzo                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **Adaptador de salida `channex`** en `outbound.ts` | Partir cada `AriMessage` en `availability` (por `room_type`) y `restrictions` (precio por `rate_plan`). Agrupar noches seguidas con el mismo valor en rangos `date_from`/`date_to`. Respetar 10/min por establecimiento, reintentando con espera en `429`.                                                                                              | 2-3 días                     |
| **Sincronización completa**                        | Botón «Sincronizar todo» y llamada al conectar, todo el horizonte en bloques.                                                                                                                                                                                                                                                                           | 1 día                        |
| **Función `channex-webhook`**                      | Channex no firma con nuestro HMAC: autentica con una cabecera secreta. La función comprueba la cabecera, pide la revisión, la traduce a nuestro `channelEvent` (`reservation.created/modified/cancelled`), la pasa por el mismo `inbound.ts` y hace el _ack_ solo si se guardó. Además, un **barrido del feed** programado por si se pierde un webhook. | 3-4 días                     |
| **Tarjeta del huésped**                            | Las reservas de Booking «pago en el hotel» traen tarjeta (o tarjeta virtual de Booking). **No guardamos tarjetas**: se usa la tokenización PCI de Channex (0,02 $/operación) y recepción la ve en su _iframe_ seguro, o se cobra por TPV.                                                                                                               | 1-2 días                     |
| **Restricciones**                                  | Hoy solo mandamos disponibilidad y precio medio. Hay que añadir estancia mínima y cerrado a la venta, y una tarifa por tipo (hoy `rate_group`). Para hostales basta con 1 tarifa por tipo de habitación.                                                                                                                                                | 1-2 días                     |
| **Mapeo en el panel**                              | En «Canales», conectar un establecimiento a Channex (crear `property`, `room_types` y `rate_plans` por API) e incrustar su _iframe_ para enlazar con Booking.                                                                                                                                                                                           | 2 días                       |
| **Pruebas y certificación**                        | Unitarias del traductor, `scripts/e2e-channels.mjs` contra el entorno de pruebas de Channex y los casos de su certificación.                                                                                                                                                                                                                            | 3-4 días + espera de Channex |

**Total: unas 2-3 semanas de trabajo**, que pueden ir en paralelo con el paso a producción (`docs/pasar-a-produccion.md`).

### Riesgos

- **Overbooking en el cambio**: el día que se conecta, Booking tiene que dejar de recibir disponibilidad del sistema anterior y empezar a recibir la nuestra. Se hace con la carga completa y una ventana corta acordada con el hotel, mejor un martes o miércoles de poca ocupación.
- **Un canal para todo**: si el hotel vende también en Expedia o Hostelworld, se conectan a la vez por Channex. Hay que preguntarlo en la primera visita.
- **Dependencia de Channex**: si cambia precios o cierra, se cambia de adaptador. La capa neutral está para eso.

## 5. Siguiente paso

1. Crear la cuenta de pruebas de Channex y generar la clave de API (gratis).
2. Hacer el adaptador y la función de webhook contra ese entorno, con tests.
3. Pedir la certificación.
4. Contratar la marca blanca **solo cuando** haya un cliente firmado listo para conectar.

Fuentes: [Booking.com Connectivity Partner Programme](https://connectivity.booking.com/s/?language=en_US) · [Channex: precios](https://channex.io/pricing) · [Channex: guía de integración para PMS](https://docs.channex.io/guides/pms-integration-guide) · [Channex: pruebas de certificación](https://docs.channex.io/api-v.1-documentation/pms-certification-tests) · [Channex: ARI](https://docs.channex.io/api-v.1-documentation/ari) · [Beds24: conectar un PMS por API](https://wiki.beds24.com/index.php/Connect_PMS_with_API).
