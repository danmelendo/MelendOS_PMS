# Conector con Booking.com

_02/10/2026. Para poder vender a hostales que viven de Booking (primer caso: `clientes/hoteles-alcala/`)._

## Decisión (02/10/2026, Dan)

- **Vendemos el PMS, no la integración con las OTAs.** El canal es una pieza nuestra por debajo: el hotel nunca contrata ni usa otro programa (ni Beds24, ni Octorate, ni el channel manager que tenga hoy).
- **Fase 1, hasta escalar: WooDoo (WuBook).** Pago por canal, sin cuota fija.
- **Fase 2: Channex en marca blanca**, cuando la cuota fija se reparta entre suficientes hoteles o haya hoteles con muchos canales (sección 6).
- El cambio de proveedor es **un adaptador más** en la capa de canales (`docs/channels.md`, `adapterFor(provider)`). Se despliega como una actualización normal y se migra hotel a hotel (sección 7).

## 1. Por qué no directamente con Booking

- El _Connectivity Partner Programme_ de Booking tiene **pausadas las integraciones con proveedores nuevos** «hasta nuevo aviso».
- Aunque se reabriera, ser proveedor directo exige certificación, rendimiento mínimo y soporte continuo. Con dos personas no compensa.
- Booking **no ofrece iCal para hoteles**, así que no hay atajo «de calendario».

Booking siempre irá por un intermediario certificado.

## 2. Proveedores para PMS

|                                                       | WooDoo (WuBook)                                                                                            | Channex                                                                | Rentals United                                        |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| Precio público                                        | **7 €/mes por canal** (6 € de 4-5 canales, 5 € desde 6). Sin cuota fija. Alta y baja de canales mes a mes. | 130 $/mes de plataforma + 7 $/mes por establecimiento con canal activo | Presupuesto a medida; enfocado a viviendas turísticas |
| Con Hoteles Alcalá (3 establecimientos, solo Booking) | **~21 €/mes** [confirmar si es por canal y establecimiento]                                                | ~140 €/mes                                                             | —                                                     |
| Conviene cuando                                       | Pocos clientes, 1-2 canales por hotel                                                                      | Muchos clientes o muchos canales por hotel                             | —                                                     |
| Quién es                                              | Empresa italiana (UE) que **también vende un PMS** (sección 3)                                             | Solo infraestructura para PMS; no compite con nosotros                 | —                                                     |

Margen del paquete Distribución con Hoteles Alcalá (96 €/mes): **unos +75 €/mes con WooDoo** frente a −45 €/mes con Channex.

## 3. WuBook es competidor: ¿problema legal?

**No es ilegal.** WooDoo es un producto que WuBook vende expresamente a terceros («PMS, RMS u otro software»), con programa de partners. Comprar un servicio a un competidor es legal y habitual. El riesgo es **contractual y comercial**, y se cubre en el contrato de partner. Antes de firmar, comprobar o pedir:

1. **Datos de nuestros clientes**:
   - WuBook será **subencargado** nuestro (anexo II del encargo, `docs/legal/encargo-tratamiento.md`).
   - Su DPA tiene que prohibir usar los datos de nuestros hoteles y sus huéspedes **para fines propios**, incluido el marketing de su PMS. Si los usara así, sería responsable del tratamiento e infringiría el art. 28.10 del RGPD.
   - Pedirlo por escrito.
2. **No captación**: una cláusula por la que no ofrezcan su PMS a los hoteles que conectamos a través de ellos (_non-solicitation_). No es obligatoria, pero es lo que más nos protege. Si no la aceptan, es un riesgo comercial a vigilar, no legal.
3. **Marca y contacto**:
   - Saber qué ve el hotel. En el extranet de Booking aparecerá el proveedor de conectividad (previsiblemente «WuBook»).
   - Que el soporte y la facturación vayan **solo a nosotros**, sin contacto directo de WuBook con el hotel.
4. **Nada nos ata**:
   - que sus condiciones **no impongan exclusividad** ni prohíban usar otro channel manager;
   - preaviso de cambios de precio;
   - plazo de resolución sin penalización.
5. **Salida ordenada**: poder **exportar o leer los mapeos** (habitaciones y tarifas de Booking por hotel), para que la migración a Channex no obligue a rehacerlos a ciegas.
6. **Confidencialidad** de nuestra cartera: qué hoteles, cuántas habitaciones, volumen.

En el contrato con el hotel no hay que cambiar nada: las condiciones generales ya dicen que la conexión va «a través de un proveedor de conectividad contratado por el Prestador» (cap. 2.5) y que respondemos de nuestros subcontratistas (cap. 15.2). Solo hay que **añadir WuBook al anexo II** del encargo.

## 4. Primera versión con WooDoo (simplificada)

Lo justo para hostales:

- **Un tipo de habitación con una tarifa.** Disponibilidad y precio por noche; las restricciones (estancia mínima, cierre) siguen en el extranet al principio.
- **Reservas por consulta periódica** (cada 2-3 min), reutilizando `inbound.ts` para la idempotencia y la asignación de habitación. El webhook se añade más adelante si la API lo da.
- **Sin tarjetas**: «Pagos de Booking» o la tarjeta vista en el extranet. **No guardamos ni tokenizamos tarjetas.**
- **Sin contenido**: fotos y textos de la ficha siguen en el extranet.

| Pieza                                                                                               | Esfuerzo |
| --------------------------------------------------------------------------------------------------- | -------- |
| Adaptador de salida `woodoo` en `outbound.ts` (disponibilidad y precio por rangos, con reintentos)  | 2 días   |
| Lectura periódica de reservas nuevas, modificadas y canceladas → `channelEvent` → `inbound.ts`      | 2 días   |
| Mapeo en el panel (Canales: códigos de habitación de WooDoo por tipo) y sincronización completa     | 1-2 días |
| Pruebas (unitarias del traductor, `e2e-channels.mjs` contra su entorno) y certificación si la piden | 1-2 días |

**Total: unos 6-8 días.** La API hay que verla antes (`tdocs.wubook.net/woodooapi`): la antigua de WuBook era XML-RPC, y la de WooDoo puede ser distinta.

## 5. Fase 2: qué exige Channex a un PMS (certificación)

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

## 6. Fase 2: el adaptador de Channex

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

**Total: unas 2-3 semanas de trabajo.** Cuándo compensa: con WooDoo pagamos 5-7 € por canal y hotel; con Channex, 7 $ por hotel con todos sus canales más 130 $ fijos. Compensa cambiar cuando los hoteles tengan de media 2 o más canales y haya unos 20 hoteles conectados, o antes si WooDoo cambia de condiciones.

### Riesgos

- **Overbooking en el cambio**: el día que se conecta, Booking tiene que dejar de recibir disponibilidad del sistema anterior y empezar a recibir la nuestra. Se hace con la carga completa y una ventana corta acordada con el hotel, mejor un martes o miércoles de poca ocupación.
- **Un canal para todo**: si el hotel vende también en Expedia o Hostelworld, se conectan a la vez por Channex. Hay que preguntarlo en la primera visita.
- **Dependencia de Channex**: si cambia precios o cierra, se cambia de adaptador. La capa neutral está para eso.

## 7. Migración de WooDoo a Channex

Es una actualización del producto, pero **cada hotel tiene un paso propio en Booking**, así que no se cambia todo de golpe:

1. **Desplegar** el adaptador de Channex con el despliegue escalonado habitual (`docs/vps-actualizaciones.md`). Convive con el de WooDoo: cada canal tiene su `provider`.
2. **Por hotel**, en un día tranquilo:
   - crear su establecimiento en Channex y copiar los mapeos;
   - que el hotel **cambie de proveedor de conectividad en el extranet de Booking** (WuBook → Channex). Lo tiene que hacer él o con nosotros delante;
   - sincronización completa;
   - cambiar el `provider` del canal;
   - dar de baja el canal en WooDoo.
3. Unos minutos de ventana por hotel. Booking guarda la disponibilidad ya cargada mientras tanto, así que el riesgo es bajo.
4. El hotel no cambia nada más: mismo panel, mismas reservas, misma factura.

## 8. Siguiente paso

1. Escribir a WuBook (programa de partners): condiciones, si el precio es por canal y establecimiento, entorno de pruebas, certificación y los puntos de la sección 3.
2. Con acceso a su API: adaptador `woodoo` y lectura de reservas, con tests.
3. Añadir WuBook al anexo II del encargo y firmar su DPA.
4. Channex queda documentado (secciones 5 y 6) para la fase 2.

Fuentes: [WooDoo: channel manager con API para PMS](https://en.wubook.net/page/Woodoo-Channel-Manager-36.html) · [WuBook: partners](https://en.wubook.net/page/Partner-34.html) · [API de WooDoo](https://tdocs.wubook.net/woodooapi/Introduction.html) · [Booking.com Connectivity Partner Programme](https://connectivity.booking.com/s/?language=en_US) · [Channex: precios](https://channex.io/pricing) · [Channex: guía de integración para PMS](https://docs.channex.io/guides/pms-integration-guide) · [Channex: pruebas de certificación](https://docs.channex.io/api-v.1-documentation/pms-certification-tests) · [Channex: ARI](https://docs.channex.io/api-v.1-documentation/ari) · [Beds24: conectar un PMS por API](https://wiki.beds24.com/index.php/Connect_PMS_with_API).
