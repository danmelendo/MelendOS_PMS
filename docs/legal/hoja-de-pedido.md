# Hoja de pedido · Melend/OS

_Plantilla v0.1 · 02/10/2026. Condiciones particulares: lo único que cambia de un cliente a otro. Ejemplo rellenado para Hoteles Alcalá (opción A de `clientes/hoteles-alcala/README.md`); los datos que faltan van entre `[CORCHETES]`._

**N.º de pedido**: MOS-2026-001 · **Fecha**: [FECHA]

## 1. Partes

|                                  | Prestador                      | Cliente                    |
| -------------------------------- | ------------------------------ | -------------------------- |
| Nombre o razón social            | [NOMBRE Y APELLIDOS]           | [RAZÓN SOCIAL DEL CLIENTE] |
| NIF                              | [NIF]                          | [NIF]                      |
| Domicilio                        | [DOMICILIO], Alcalá de Henares | [DOMICILIO FISCAL]         |
| Representante                    | —                              | [NOMBRE, CARGO]            |
| Email para avisos                | [EMAIL]                        | [EMAIL DE DIRECCIÓN]       |
| Teléfono                         | [TELÉFONO]                     | [TELÉFONO]                 |
| Contacto de privacidad y brechas | [EMAIL DE PRIVACIDAD]          | [EMAIL Y TELÉFONO]         |

## 2. Establecimientos

| Establecimiento    | Dirección                                           | Habitaciones |
| ------------------ | --------------------------------------------------- | ------------ |
| Hotel Cuatro Caños | C/ Divino Figueroa, 10 · 28801 Alcalá de Henares    | [15]         |
| Hotel Complutense  | C/ Encomienda, 9 · 28805 Alcalá de Henares          | [21]         |
| Hostal Jacinto     | Pº de la Estación, 2, 1.ª · 28807 Alcalá de Henares | [12]         |
| **Total**          |                                                     | **[48]**     |

La cuota se ajusta al número real de habitaciones activas: si se añaden, desde el mes siguiente; si se quitan, desde la siguiente renovación.

## 3. Servicio contratado

| Concepto          | Detalle                                                                                                                | Importe                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Plan              | **Esencial**: PMS, motor y web de reservas, estancia, registro de viajeros (SES.HOSPEDAJES), facturación (VERI\*FACTU) | 4 €/hab./mes × [48] = **192,00 €/mes** (mínimo 69 €) |
| Paquete           | **Distribución**: conexión con Booking.com y otros canales a través de proveedor de conectividad                       | 2 €/hab./mes × [48] = **96,00 €/mes** (mínimo 29 €)  |
| SLA               | ☐ Ninguno · ☐ Prioritario · ☐ Urgente · ☐ 24/7                                                                         | [—]                                                  |
| **Total mensual** |                                                                                                                        | **288,00 €/mes**                                     |
| Forma de pago     | ☒ **Anual por adelantado** · ☐ Mensual                                                                                 |                                                      |
| Descuento         | ☒ **Fundador** (10 % anual), mantenido mientras el contrato siga sin interrupción y al corriente de pago               | −28,80 €/mes                                         |
| **Total anual**   | 259,20 €/mes × 12                                                                                                      | **3.110,40 € + IVA**                                 |
| Cuota de alta     | Incluida con el pago anual                                                                                             | **0,00 €**                                           |
| Consumo variable  | Tokenización de tarjetas de canales: al coste del proveedor (0,02 $/operación). IA: no contratada.                     | Por meses vencidos                                   |

Precios sin IVA. La factura anual se emite al terminar el periodo de prueba.

## 4. Puesta en marcha

- **Incluye**:
  - alta de los 3 establecimientos, habitaciones y tarifas;
  - importación de las reservas futuras desde el sistema actual (hoja de cálculo);
  - motor de reservas en `reservas.hotelesalcala.com`;
  - buscador en la web actual del Cliente;
  - conexión con Booking.com;
  - activación de SES.HOSPEDAJES y VERI\*FACTU con las credenciales del Cliente;
  - 1 h de formación por turno de recepción;
  - presencia del Prestador el día de arranque de cada establecimiento.
- **Orden**: Cuatro Caños primero; Complutense y Jacinto unas 2 semanas después.
- **No incluye**: diseño de una web nueva ni su migración (presupuesto aparte), ni contenidos o fotografías nuevos.
- **El Cliente aporta**:
  - TPV virtual de su banco (si quiere cobro online);
  - credenciales de SES.HOSPEDAJES;
  - certificado electrónico;
  - acceso al extranet de Booking.com;
  - acceso a su DNS;
  - hoja de habitaciones, tarifas y reservas.

## 5. Periodo de prueba

☒ **Sí**: sin cuota desde la firma hasta **30 días después** de que estén activas en producción, en todos los establecimientos:

- la conexión con Booking.com;
- la comunicación a SES.HOSPEDAJES;
- la facturación VERI\*FACTU.

Durante la prueba cualquiera de las partes puede terminar el contrato **por escrito, sin coste** (cap. 5 de las condiciones generales). Si nadie lo termina, continúa con el plan y la forma de pago de esta hoja.

## 6. Otras condiciones

- **Cliente de referencia**: ☐ Autoriza · ☐ No autoriza que el Prestador lo cite como cliente (nombre comercial y logotipo).
- **Fecha de efecto**: [FECHA DE FIRMA]. Renovación anual automática salvo aviso con 30 días de antelación.

## 7. Documentos y aceptación

Forman parte del contrato, y el Cliente declara haberlos recibido **antes de firmar**, haberlos leído y aceptarlos expresamente:

1. **Condiciones generales del servicio Melend/OS**, v[0.1], incluida la licencia de uso (cap. 3) y el carácter **no reembolsable** de las cuotas pagadas con sus excepciones (cap. 6.3 y 6.4).
2. **Contrato de encargado del tratamiento**, v[0.1], con sus anexos de medidas de seguridad y subencargados.
3. **Anexo I**: reparto de tareas de la normativa (SES.HOSPEDAJES y VERI\*FACTU).

| Por el Prestador | Por el Cliente  |
| ---------------- | --------------- |
| [Nombre]         | [Nombre, cargo] |
| Firma:           | Firma:          |
| Fecha:           | Fecha:          |
