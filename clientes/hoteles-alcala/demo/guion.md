# Demo para Hoteles Alcalá

_Adaptación de `docs/guion-demo-clientes.md` a sus tres alojamientos. 25 minutos, en su recepción, con un portátil y un móvil._

**La historia**: un día en Cuatro Caños. Entra una reserva de Booking, otra desde su propia web, llega un huésped y se hace el parte solo. Por la tarde, dirección ve los tres alojamientos en una pantalla.

## Preparación (la víspera)

### 1. Alta en la demo

Con el `.env` **de la demo** (compruébalo: nunca contra producción):

```bash
node --env-file=.env scripts/create-hotel.ts clientes/hoteles-alcala/demo/hotel.json            # comprobar
node --env-file=.env scripts/create-hotel.ts clientes/hoteles-alcala/demo/hotel.json --apply --app-url <url del panel de la demo>
```

- Crea «Hoteles Alcalá» con sus 3 establecimientos, 48 habitaciones y 9 tarifas. Las habitaciones y precios son **una estimación** a partir de su web y de Booking; si en la visita nos dan los reales, se corrige `habitaciones.csv` y se pasa con `--rooms`.
- Los usuarios son `direccion@alcala.demostays.example` y `recepcion@alcala.demostays.example`. Entra con ellos como en Hotel Lumen, o pásate por `platform-admin.mjs` con tu cuenta.
- Plan Esencial con los paquetes Estancia y Distribución: es lo que les vamos a ofrecer.

### 2. Su imagen (en el panel, Admin → Web y dominio, como dirección)

- **Logo y fotos**: haz tú fotos de las fachadas y de la Plaza de Cervantes. Si usas las de su web, que sea **solo para esta demo privada** y bórralas si no firman.
- Portada: Calle Mayor o la Plaza de Cervantes. Título «Hoteles Alcalá». Subtítulo: el lema de `hotel.json`.
- «Sobre nosotros»: tres líneas por alojamiento con lo que dice su web (cerca del Rectorado, de la estación, del centro).

### 3. Lo que hace falta para las escenas

- **Extras**: «Desayuno en cafetería cercana» (si lo ofrecen), «Parking concertado», «Late check-out».
- **Canal de Booking de demostración** (Admin → Canales): nombre «Booking.com», tipo OTA, proveedor `demo`, comisión del 17 %. Asigna un código a cada tipo de habitación de Cuatro Caños (`CC-DBL`, `CC-SGL`).
- **Pasarela** (Admin → Pagos): las credenciales de **prueba** de Redsys, las mismas que Hotel Lumen, para que «pagar online» funcione con la tarjeta de test.
- **Un código promocional** de «reserva directa»: `DIRECTO10`, −10 %. Es el argumento contra Booking.
- **Unas reservas** para que «Hoy» no esté vacío: 4-5 hechas a mano desde la web (dos para hoy en Cuatro Caños, una alojada en Complutense y una para el fin de semana en Jacinto). `demo-cycle.mjs` solo funciona con Hotel Lumen.
- Abre tres pestañas:
  1. `/ejemplo-web?hotel=hoteles-alcala`: «vuestra web con el widget».
  2. La web del motor (`/web`, Hoteles Alcalá).
  3. El panel en `/today` como recepción.

## La demo

### 1. El problema (2 min, sin pantalla)

«Hoy, quien entra en vuestra web y quiere reservar tiene un formulario o un teléfono. Si no contestáis en el momento, reserva en Booking y os cuesta un 15-18 %. Y cada mañana hacéis tres veces los partes.»

Pregunta: **«¿Cuántas reservas os entran por la web al mes y cuántas por Booking?»**

### 2. «Vuestra web, pero que vende» (5 min)

Pestaña 1 (`/ejemplo-web`):

1. Es su web de siempre con el **buscador** puesto. «No hay que cambiar la web ni perder lo que tenéis en Google.»
2. Busca dos noches en Cuatro Caños. Salen las habitaciones **con el precio por noche** en el calendario.
3. Reserva con `DIRECTO10`: «en vuestra web, 10 % más barato que en Booking, y vosotros sin comisión».
4. **Pago en el hotel** (es lo que hacen hoy) y, si quieren, **online** con su TPV de banco.
5. Enséñales el email de confirmación con su cabecera y «Mi reserva» en el móvil.
6. **El asistente** (botón «¿Te ayudo a reservar?»), solo si se interesan: «Una habitación para dos el puente, cerca de la estación» → propone Jacinto.

### 3. Llega una reserva de Booking (3 min)

En el panel, Canales → «Simular reserva» en el canal Booking.com:

- La reserva aparece en el **planning** de Cuatro Caños con su origen y la comisión.
- «La disponibilidad se actualiza sola en Booking: no hay que cerrar la habitación a mano y no hay overbooking.»
- Honestidad: **«La conexión real con Booking la hacemos en la puesta en marcha, por un channel manager certificado. Hoy veis la simulación.»**

### 4. La recepción (8 min)

1. **«Hoy»** en Cuatro Caños: llegadas, salidas, ocupación.
2. **Check-in** de una llegada: datos del viajero, firma en el móvil o la tablet y **el parte de SES.HOSPEDAJES sale solo**. «El huésped puede hacerlo antes desde su móvil, con un enlace que caduca.»
3. **Cambia de establecimiento**: lo mismo en Complutense y Jacinto, **en la misma pantalla**. «Un panel para los tres, y cada recepción ve lo suyo.»
4. **Cuenta de la estancia**: un cargo (parking) y el cobro a la salida.
5. **Factura VERI\*FACTU** con QR: «desde el 1 de enero de 2027 si sois sociedad (julio si autónomos), Hacienda exige esto. Con esto ya lo tenéis».
6. **Chat**: un mensaje de huésped («¿a qué hora puedo dejar la maleta?») contestado desde el panel.

### 5. Dirección: los tres de un vistazo (3 min)

Entra como dirección:

- **Informes**: ocupación, precio medio, RevPAR y **canales**. «Cuánto os cuesta Booking al mes y cuánto entra directo.»
- **Tarifas**: subir el sábado de Complutense y ver que se aplica en la web.

### 6. Cierre (4 min)

- La cuenta, con sus números: «si pasáis 5 de cada 100 reservas de Booking a vuestra web, os ahorráis unos 500 € al mes; la cuota con Booking incluido son 259 €».
- La propuesta sin riesgo: **sin coste hasta que todo funcione con vuestros datos, y 30 días más**. Empezamos por Cuatro Caños.
- «Os lo monto yo, que estoy aquí al lado. Si algo falla, vengo.»
- Pide: su hoja de habitaciones y precios, y quién lleva su web y su dominio.

## Si preguntan…

| Pregunta                              | Respuesta                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| «¿Y si se cae internet?»              | El panel funciona en el móvil con datos. Las reservas de Booking esperan en el channel manager y entran al volver.                   |
| «¿Perdemos lo que tenemos en Google?» | No. Al principio no tocamos vuestra web; solo añadimos el buscador. Si un día la renovamos, cada página antigua redirige a la nueva. |
| «¿Y lo que ya tenemos reservado?»     | Lo importamos desde vuestro Excel o vuestro programa antes de empezar.                                                               |
| «¿Booking nos penaliza?»              | No. Seguís en Booking igual; solo cambia que la disponibilidad la manda este programa.                                               |
| «¿Si no nos convence?»                | Os vais cuando queráis y os llevamos todos vuestros datos.                                                                           |
| «¿Quién está detrás?»                 | Yo, de Alcalá, con soporte en persona. Y el contrato con la protección de datos de vuestros huéspedes firmado.                       |

## Después

- Si **no** firman: borra las fotos que fueran suyas y pide que se borre el hotel de la demo. Aún no hay script para borrarlo; es la tarea 5 del README.
- Si **sí**: sección 3 del `README.md`, semana 1.
