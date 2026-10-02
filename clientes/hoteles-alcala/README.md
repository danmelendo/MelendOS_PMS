# Hoteles Alcalá: plan de implantación

_02/10/2026. Primer cliente objetivo de Melend/OS. Datos públicos del negocio (su web, Booking y directorios); no hay datos de huéspedes. Lo marcado **[estimación]** hay que confirmarlo en la primera visita._

| Fichero                                    | Qué es                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `README.md`                                | Este plan: quiénes son, qué les ofrecemos, calendario y qué necesitamos de ellos. |
| `demo/hotel.json`, `demo/habitaciones.csv` | Alta de los tres alojamientos en la demo (validados con el esquema del alta).     |
| `demo/guion.md`                            | La demo adaptada a ellos, paso a paso.                                            |
| `../../docs/conector-booking.md`           | Cómo conectamos con Booking (imprescindible para este cliente).                   |
| `../../docs/legal/`                        | Modelos de contrato para firmar con ellos.                                        |

## 1. Quiénes son

Negocio familiar de tres alojamientos en el centro de Alcalá, con una web común (`hotelesalcala.com`, PHP, una página por alojamiento).

| Alojamiento                                                    | Dirección                 | Hab.                                          | Valoraciones                                             | Contacto                                  |
| -------------------------------------------------------------- | ------------------------- | --------------------------------------------- | -------------------------------------------------------- | ----------------------------------------- |
| **Hotel Complutense** (2★)                                     | C/ Encomienda, 9          | 21-29 [estimación: 21]                        | Booking 7,6 (811 reseñas) · Google 3,4 · TripAdvisor 2,6 | 91 882 34 69 · 639 388 370 · complutense@ |
| **Hotel Cuatro Caños** (2★, reformado en 2017, recepción 24 h) | C/ Divino Figueroa, 10    | 15                                            | 7,6                                                      | 91 881 38 44 · 676 123 365 · info@        |
| **Hostal Jacinto**                                             | Pº de la Estación, 2, 1.ª | ? [estimación: 12], parte con baño compartido | Google 3,3 · TripAdvisor 2,5                             | 91 889 14 32 · jacinto@                   |

**Total de trabajo: 48 habitaciones [estimación].**

Lo que importa para la venta:

- **Su web no vende.** «Reservar» es un formulario y dos teléfonos (`reservas_complutense.php`, `reservas_cuatro.php`).
- **Viven de Booking.** 811 reseñas solo en Complutense. Sin conexión con Booking no cambian de sistema.
- **Su dominio tiene antigüedad y posicionamiento.** Cualquier cambio de web tiene que conservarlos (sección 4).
- **Tres establecimientos** significan tres juegos de partes de SES.HOSPEDAJES cada día, y facturas que desde 2027 tendrán que cumplir VERI\*FACTU (sección 6).

## 2. Qué les ofrecemos

Un solo panel para los tres alojamientos (un «hotel» en Melend/OS con tres establecimientos), reserva directa en su web, Booking conectado, partes de viajeros y facturas automáticos.

Precios sacados de la calculadora (`site/supabase/functions/_shared/plans.ts`), con 48 habitaciones:

| Opción                                               | Qué incluye                                                                                                 | €/mes      | €/año    | Alta   |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------- | -------- | ------ |
| **A. Esencial + Distribución, anual de fundador** ⭐ | PMS, web de reserva directa, estancia (chat, cuenta, reseñas), registro de viajeros, facturas y **Booking** | **259,20** | 3.110,40 | gratis |
| B. Esencial + Distribución, mensual                  | Lo mismo, sin permanencia                                                                                   | 288,00     | —        | 149 €  |
| C. Hostal, anual de fundador                         | Lo imprescindible, **sin Booking**                                                                          | 129,60     | 1.555,20 | gratis |

- **No ofrecer el plan Grupo** (490 €/mes de mínimo y 1.490 € de alta): es para cadenas con varias empresas o equipos. Son un solo dueño con tres casas, y el producto ya lo cubre como tres establecimientos de un hotel.
- La cuenta que les cuadra: con unos 60.000 €/mes de facturación [estimación], si pasan **5 puntos** de las reservas de Booking a venta directa se ahorran unos **500 €/mes** de comisión. Es el doble de la cuota.
- **Coste para nosotros**: Channex ≈ 140 €/mes con sus tres establecimientos (`docs/conector-booking.md`). Con este cliente solo, la parte de Distribución sale a pérdidas unos 45 €/mes. Lo asumimos como inversión de arranque: es nuestra referencia local.

### Cómo cerrar sin que corran riesgo

Son «de toda la vida» y no quieren perder nada. La propuesta:

1. **Prueba sin coste hasta que todo funcione con sus datos reales**, más 30 días. No pagan nada hasta que Booking, los partes y las facturas están en marcha.
2. Después, **anual de fundador** (opción A), con la cuota anual por adelantado y no reembolsable, como dicen las condiciones.
3. Arranque escalonado: **Cuatro Caños primero** (15 habitaciones, recepción 24 h), y Complutense y Jacinto dos semanas después.
4. Se pueden ir cuando quieran: exportación completa de sus datos.

## 3. Calendario

Semana 0 es la primera visita. Las semanas del 1 al 5 de Melend/OS corren en paralelo.

| Semana  | Nosotros                                                                                                                                                                                                                                                            | Ellos                                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0**   | Primera visita (sin pantalla, solo preguntas; sección 7).                                                                                                                                                                                                           | Contarnos cómo trabajan hoy.                                                                                                                                                         |
| **1**   | **Demo con sus tres alojamientos** (`demo/guion.md`). Ajustar habitaciones y precios con lo que nos cuenten.                                                                                                                                                        | Ver la demo. Decir sí o no a la prueba.                                                                                                                                              |
| **1**   | Si dicen sí: **alta de autónomo** (sección 8) y firma de las **condiciones + encargo de tratamiento** (`docs/legal/`).                                                                                                                                              | Firmar.                                                                                                                                                                              |
| **1-5** | **Producción** (`docs/pasar-a-produccion.md`): Supabase de pago, frontend publicado, emails reales. **Conector de Channex** y su certificación (`docs/conector-booking.md`). **SES y VERI\*FACTU** contra los entornos reales con las credenciales de Cuatro Caños. | **Pedir el TPV virtual (Redsys)** a su banco, que tarda de 1 a 3 semanas. Darnos las credenciales de SES.HOSPEDAJES, el certificado electrónico y su hoja de habitaciones y tarifas. |
| **5**   | Alta real (`scripts/create-hotel.ts`) e **importación de las reservas futuras** desde su sistema actual (`scripts/import-reservations.ts`). Formación de 1 h por turno de recepción.                                                                                | Exportar las reservas futuras (CSV o Excel). Probar con reservas de prueba.                                                                                                          |
| **6**   | **Arranque de Cuatro Caños**: conectar Booking por Channex en una ventana tranquila (martes o miércoles), activar partes y facturas, y poner el widget en su web.                                                                                                   | Trabajar con Melend/OS. Llamarnos ante cualquier duda. Ese día estamos allí.                                                                                                         |
| **8**   | **Arranque de Complutense y Jacinto**, igual.                                                                                                                                                                                                                       | —                                                                                                                                                                                    |
| **10**  | Revisión: reservas directas frente a Booking, incidencias, qué echan en falta. Empieza a contar la cuota.                                                                                                                                                           | —                                                                                                                                                                                    |

**Condición para arrancar**: no se conecta Booking sin certificación de Channex, y no se activan partes ni facturas reales sin una comunicación aceptada en los entornos de prueba del ministerio y la AEAT. Si algo se retrasa, se retrasa el arranque, no se arranca a medias.

## 4. Su web y su dominio

Quieren modernizar la web sin perder posicionamiento. Dos fases:

**Fase 1, incluida en el plan (arranque)**

- El motor en `reservas.hotelesalcala.com`: un CNAME en su DNS; el panel lo guía y lo comprueba.
- El **widget** (buscador y asistente) en su web actual. Los botones «Reservar» de cada alojamiento llevan al motor con el establecimiento elegido.
- Nada cambia en sus URLs: **cero riesgo para el SEO**.

**Fase 2, servicio aparte con presupuesto cerrado (después del arranque)**

- Web nueva en el **mismo dominio**: o la web de plantilla de Melend/OS en su dominio raíz, o una web ligera hecha aparte con el widget dentro.
- **Lista de comprobación del SEO**:
  - Inventario de URLs actuales (`index.php`, `cuatro.php`, `jacinto.php`, `servicios_*.php`, `contacto_*.php`, `reservas_*.php`…) con **redirecciones 301**, una por una, a sus equivalentes nuevas.
  - Mismos títulos y textos clave por alojamiento.
  - Datos estructurados `Hotel` por establecimiento, `sitemap.xml` y alta en Search Console antes y después.
  - Revisar las **tres fichas de Google Business Profile** (dirección, web, botón de reservar al motor).
  - Seguimiento de posiciones 4 semanas.
- Ojo: hoy la plantilla de Melend/OS no gestiona redirecciones de rutas antiguas. Si se usa en el dominio raíz, las 301 se ponen en el alojamiento del frontend (reglas de Vercel o Netlify) o en un proxy delante. Hay que comprobarlo **antes** de presupuestar la fase 2.

## 5. Booking

Imprescindible para este cliente. Va por Channex en marca blanca, con 2-3 semanas de desarrollo y certificación (`docs/conector-booking.md`). Primero, en la visita:

- ¿Qué **channel manager** o PMS usan hoy para Booking, si usan alguno? Si es uno con API abierta, se valora conectarlo directamente al principio.
- ¿Venden también en Expedia, Hostelworld o Airbnb? Channex los conecta todos a la vez.
- ¿Las reservas de Booking son con pago a Booking o pago en el hotel con tarjeta? Lo segundo exige la tokenización de Channex: **no guardamos tarjetas**.

## 6. Normativa: el argumento de tranquilidad

- **SES.HOSPEDAJES**: obligatorio desde diciembre de 2024. Seguramente ya lo hacen a mano, tres veces. Con Melend/OS se envía al hacer el check-in.
- **VERI\*FACTU**: obligatorio desde el **1 de enero de 2027 si facturan como sociedad** y desde el **1 de julio de 2027 si son autónomos** (RDL 15/2025). Tienen que cambiar de programa de facturación de todos modos; que sea este.
- Sé honesto en la demo: está integrado y probado en entornos simulados. La puesta en marcha con sus credenciales es parte de la implantación (semanas 1-5).

## 7. Primera visita: qué preguntar

1. ¿Con qué programa llevan hoy las reservas y las habitaciones? ¿Excel, libreta, un PMS?
2. ¿Qué parte de sus reservas viene de Booking? ¿Y de teléfono o de la web?
3. ¿Channel manager? ¿Qué otras OTAs?
4. ¿Cómo hacen los partes de SES.HOSPEDAJES? ¿Quién y cuándo?
5. ¿Con qué facturan? ¿Son sociedad o autónomos? Esto marca la fecha de VERI\*FACTU.
6. ¿Tienen TPV virtual o solo datáfono? ¿Con qué banco?
7. ¿Quién decide y quién lo va a usar? Dueño, recepción, turnos de noche.
8. ¿Número real de habitaciones y tipos por alojamiento? ¿Precios de temporada?
9. ¿Quién les hizo la web y quién gestiona el dominio y el DNS?

## 8. Antes de firmar: alta de autónomo de Dan

El contrato lleva el NIF y el domicilio del prestador. El alta tiene que hacerse **antes de firmar y facturar**; puede ser el mismo día.

1. **Hacienda (modelo 036/037)**: alta censal con el epígrafe del IAE de servicios informáticos (lo confirma la gestoría), régimen de IVA general (21 %) e IRPF en estimación directa. Pagos fraccionados con el modelo 130 y el IVA con el 303 cada trimestre.
2. **Seguridad Social (RETA)**: con la **tarifa plana**, 80 €/mes los 12 primeros meses si no ha estado de alta en los 2 últimos años.
3. **Seguro de responsabilidad civil profesional**, que cubra errores de software y protección de datos. Como autónomo se responde con el patrimonio personal; el contrato limita la responsabilidad, pero el seguro es la red.
4. **Facturar con un programa que cumpla VERI\*FACTU** (nosotros mismos, desde julio de 2027 como autónomo).
5. Revisar con la gestoría cuándo compensa pasar a **sociedad limitada**: más clientes, más riesgo o más facturación.
6. **Abogado**: revisión de `docs/legal/` antes de la firma (presupuesto cerrado, 1-2 días).

## 9. Lo que queda por hacer en el producto para este cliente

| #   | Qué                                                                                | Dónde                                         | Bloquea          |
| --- | ---------------------------------------------------------------------------------- | --------------------------------------------- | ---------------- |
| 1   | Producción: Supabase de pago, frontend publicado, dominios, emails                 | `docs/pasar-a-produccion.md`                  | Arranque         |
| 2   | Adaptador Channex, webhook, certificación                                          | `docs/conector-booking.md`                    | Arranque         |
| 3   | SES.HOSPEDAJES y VERI\*FACTU contra los entornos reales                            | `docs/ses-hospedajes.md`, `docs/verifactu.md` | Arranque         |
| 4   | Redsys en real con su banco                                                        | `docs/estado-producto.md`                     | Pago online      |
| 5   | Script para **borrar un hotel de la demo** cuando una demo no sale (hoy no existe) | `scripts/`                                    | Limpieza         |
| 6   | Redirecciones 301 si la web nueva va en el dominio raíz                            | Sección 4                                     | Fase 2 de la web |
