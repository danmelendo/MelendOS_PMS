# Guion para demostrar Melend/OS a un hotel

_Para Dan (y quien presente). Una demo de 20–30 min que enseña el producto de punta a punta con datos ficticios. Adáptalo al cliente: un hostal no necesita ver canales ni club; una cadena, sí._

## Antes de empezar (5 min de preparación)

1. **Enciende el PC** con el modelo de IA (si vas a enseñar el asistente): `node --env-file=.env scripts/llm-gateway.mjs` y el túnel (ver `CLAUDE.md`).
2. **Deja datos frescos en la demo**: `node --env-file=.env scripts/demo-cycle.mjs --keep`. Crea 10 reservas con historia realista en Hotel Lumen (llegadas, salidas, un no-show, cancelaciones, una reseña, cargos a la cuenta). Al terminar la reunión: `--remove`.
3. Abre dos pestañas: la **web del huésped** (`/web`, Hotel Lumen) y el **panel del hotel** (`/today`, entra como «Recepción · Hotel Lumen»).
4. Ten a mano el móvil para enseñar que la web y el panel funcionan en el teléfono.

**Regla de oro**: no es una lista de funciones, es _un día en la recepción_. Cuenta una historia.

---

## 1. El problema (2 min, sin pantalla)

- «Hoy gestionáis reservas, cobros, el parte de viajeros a la policía, las facturas y las reseñas en **sitios distintos**: la web, el TPV del banco, el Excel, SES.HOSPEDAJES, el programa de facturación… Melend/OS lo une en uno, cumpliendo la normativa, y **se integra en la web que ya tenéis**.»
- Pregunta que engancha: «¿Cuánto tardáis en registrar a un huésped en SES.HOSPEDAJES cada mañana?»

## 2. La reserva, desde el lado del huésped (5 min)

En la pestaña de la **web** (`/web` → Hotel Lumen):

1. **Ver habitaciones y precios**: el selector de fechas «serpentea» y **muestra el precio medio de cada noche**, como las aerolíneas; «–» si está lleno.
2. Elige fechas y una habitación. Enseña la ficha con fotos, capacidad y extras.
3. **Reserva**: nombre, email, un extra (desayuno) y un **código promocional** (`OTONO15`, −15 %). Recalca: «el precio y el descuento se calculan en **nuestro servidor**, no en el navegador; el cliente no puede manipularlo».
4. **Pago**: elige «pagar online». (En la demo es el entorno de pruebas de Redsys; con tarjeta de test se confirma.) O «pagar en el hotel»: se confirma al momento.
5. Enseña el **email de confirmación** (en la demo sale como «simulado») y el enlace «Mi reserva», donde el huésped **sin cuenta** ve su reserva con referencia + email.
6. **Check-in online**: enseña que el huésped recibe además un **enlace de un solo uso** para rellenar los **datos del viajero** (SES.HOSPEDAJES) y **firmar desde su móvil** antes de llegar. Cuando llega, el parte ya está hecho; recepción solo lo confirma. «El enlace caduca al firmar: no queda un enlace vivo con los datos del huésped dando vueltas.»

**Frase clave**: «Todo esto ocurre en **vuestra** web o en un subdominio vuestro. No mandáis al cliente a otra marca.»

## 3. El asistente de IA (3 min, si el cliente valora la atención)

En `/web`, abre el widget **«¿Te ayudo a reservar?»**:

- «Quiero una habitación para 2 personas la semana que viene» → el asistente **busca, cotiza y enseña las habitaciones con foto y precio**, con botones para cambiar fechas y personas.
- «¿Qué extras tenéis?» → los lista con su precio real.
- Enseña que **recupera una reserva** verificando identidad (email + apellido + fecha) y que **cancela** con preguntas de verificación y confirmación.
- Recalca la seguridad: «El asistente **nunca inventa precios ni reservas**: el servidor le corrige. Y solo habla del hotel.»

> Si el hotel no quiere IA, sáltalo: es un paquete opcional.

## 4. La recepción: el panel (8 min) — el corazón de la demo

Cambia a la pestaña del **panel** (entra como «Recepción · Hotel Lumen»).

1. **«Hoy»**: llegadas, salidas, alojados y ocupación de un vistazo. Están las reservas que creó `demo-cycle`.
   - Haz un **check-in** de una llegada. Si el huésped ya hizo el check-in online, los **datos del viajero** (documento, nacionalidad…) y la **firma** ya están; recepción solo los confirma y el parte de SES.HOSPEDAJES se envía solo.
   - **Los imprevistos, contemplados**: «¿Y si llega alguien que no lo hizo online, o un walk-in sin móvil? Recepción hace el mismo check-in en su **propia tablet o móvil**, se lo pasa al huésped para firmar y listo. En un hotel siempre hay imprevistos; están previstos.»
   - Si sale el recuadro **«Necesita tu atención»**, explícalo: «El programa te avisa de lo que tienes que arreglar tú —un parte con datos incompletos, una factura rechazada— aquí y por email a dirección.»
2. **La cuenta de la estancia (folio)**: abre una reserva alojada, añade un **cargo** (una cena), y enseña el **saldo** y el **pago de la cuenta** al salir.
3. **Calendario / planning**: habitaciones × días. Arrastra la vista, enseña la ocupación.
4. **Reservas**: busca por **referencia parcial, nombre o teléfono**. «Cuando el cliente llama y solo recuerda media referencia, la encontráis.»
5. **Chat con recepción**: enseña un mensaje de un huésped (`demo-cycle` deja uno pidiendo toallas). «El huésped habla con recepción desde su reserva; las peticiones no se pierden en el teléfono.»
6. **Cancelaciones**: en «Hoy», la bandeja de solicitudes. Aprueba una. «El huésped cancela gratis dentro de plazo; fuera, lo decidís vosotros, y el motivo queda clasificado.»
7. **Facturas (VERI\*FACTU)** e **Informes**: enséñalos por encima (ocupación, ADR, RevPAR, motivos de cancelación). «Los números que la gestoría os pide, ya hechos.»

## 5. Normativa, sin susto (2 min)

- **SES.HOSPEDAJES**: «El parte de viajeros se genera y se envía solo al hacer el check-in. El huésped puede adelantarlo online con un **enlace de un solo uso** (datos + firma desde su móvil); si no, lo hacéis en el momento en vuestra tablet. En ambos casos vosotros solo confirmáis.»
- **VERI\*FACTU**: «Cada factura lleva su huella y su QR, encadenada, como exige Hacienda desde 2026.»
- **Sé honesto**: «Ambas están **integradas** y probadas en entorno simulado; la puesta en marcha con vuestro certificado y vuestras credenciales es parte de la implantación.» (No prometas que ya emite a producción si aún no se ha verificado contra el ministerio y la AEAT.)

## 6. Cómo se vende y se integra (3 min)

- **Se integra en vuestra web actual** con una línea de código (el widget), o os damos una **web de plantilla incluida** con vuestras fotos, o un **subdominio de reservas**.
- **Paquetes**: base (PMS + reservas + registro de viajeros + pagos) y módulos activables: Estancia (chat, cuenta, reseñas), IA, Cadena (club), Datos (informes), Distribución (OTAs). «No pagáis por lo que no usáis.»
- **Pasarela de pago**: «Funciona con **el TPV de vuestro banco** (Redsys, que usan casi todos los bancos españoles) o con Stripe. Metéis vuestras credenciales y listo; el dinero va a vuestra cuenta, no pasa por nosotros.»
- **Precios** (`site/` → `/precios/`): calculadora por habitaciones. Plan Hostal desde 39 €/mes.

## 7. Cierre (2 min)

- «¿Qué es lo que más tiempo os quita ahora?» → conecta con lo que has enseñado.
- Ofrece: «Os damos de alta un entorno de prueba con **vuestras** habitaciones y tarifas para que lo probéis una semana sin compromiso.»
- Recoge el lead (o que rellenen `/demo/` en la web de ventas).

---

## Preguntas frecuentes de un hotelero (ten las respuestas listas)

| Pregunta | Respuesta corta |
| --- | --- |
| «¿Y si ya tengo web?» | Se integra en ella con el widget; no hay que cambiarla. |
| «¿El dinero pasa por vosotros?» | No. Cobráis con el TPV de vuestro banco; nosotros no tocamos el dinero. |
| «¿Cumple con el registro de viajeros nuevo?» | Sí, SES.HOSPEDAJES integrado; se envía al hacer el check-in. |
| «¿El huésped tiene que hacer algo?» | No es obligatorio: recibe un enlace de un solo uso para el check-in online (datos + firma desde el móvil). Si no lo usa, recepción lo completa a la llegada en su tablet. |
| «¿Y VeriFactu?» | Integrado, con huella y QR. La puesta en marcha con vuestro certificado va en la implantación. |
| «¿Se conecta con Booking?» | Está preparado (paquete Distribución); la conexión real con cada OTA se acuerda en la implantación. |
| «¿Qué pasa si se cae?» | Está sobre Supabase (infraestructura profesional); hay copias y alertas automáticas. El SLA se contrata según lo que necesitéis. |
| «¿Mis datos están seguros?» | RLS por hotel: cada hotel solo ve lo suyo. Datos sensibles (DNI, domicilio) solo los ve dirección, con reautenticación. Hemos hecho pentesting. |
| «¿Cuánto tarda la puesta en marcha?» | Damos de alta el hotel con vuestras habitaciones y tarifas desde vuestro Excel; unos días. |

## Qué NO hacer

- No prometas cumplimiento normativo «en producción» antes de verificarlo contra el ministerio y la AEAT.
- No enseñes datos reales de otro cliente.
- No improvises precios: usa la calculadora.
- No cierres el PC a media demo (el asistente dejaría de responder). Si no vas a enseñar IA, no dependas de él.

## Después de la reunión

- `node --env-file=.env scripts/demo-cycle.mjs --remove` para dejar la demo limpia.
- Anota el lead en el panel de gestión (`/admin/`).
