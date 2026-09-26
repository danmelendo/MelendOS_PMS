# Precios y SLA: propuesta y porqué

Propuesta del 26/09/2026. Las cifras están en `supabase/functions/_shared/plans.ts` (una sola
fuente para la página de precios, la calculadora y la tabla del SLA). Precios en euros, sin IVA.

## Principio

Sin reputación en el sector, el riesgo percibido pesa más que el precio. La propuesta:

1. **Más barato que la competencia, pero rentable**: un 25-40 % por debajo a igualdad de
   módulos, con precios que pagan dos sueldos (ver «Rentabilidad»).
2. **Quitar el riesgo de probar**: precio publicado (los grandes solo dan presupuesto), sin
   permanencia, garantía de 60 días, exportación completa de datos, SLA con compensación
   automática y un programa de hoteles fundadores. Esto convence más que bajar el precio y cuesta
   mucho menos; un precio bajo, además, es difícil de subir después.

## Planes

| Plan            | €/hab./mes | Mínimo/mes | Implantación                     | Incluye                                          |
| --------------- | ---------- | ---------- | -------------------------------- | ------------------------------------------------ |
| **Esencial**    | 4          | 69         | 149 € (gratis con el pago anual) | Base + Estancia                                  |
| **Profesional** | 9          | 149        | 490 €                            | Todo (IA, Datos, Distribución, Cadena)           |
| **Grupo**       | 8          | 490        | Desde 1.490 €                    | Todo, desde 2 hoteles, SLA 99,9 % y guardia 24/7 |

- **Paquetes sueltos sobre Esencial**: IA +3 €/hab. (mín. 59), Datos +1 € (mín. 19),
  Distribución +2 € (mín. 29). Con los tres, Profesional sale más barato, y la calculadora lo
  dice.
- **Pago anual**: −15 % (y cobro por adelantado, que a una empresa pequeña le da caja).
- **Fundadores**: −25 % durante 12 meses para los 10 primeros hoteles, a cambio de sus
  comentarios y un caso de éxito. No acumulable con el pago anual.
- **Garantía de 60 días**: se devuelven las cuotas mensuales, no la implantación (es trabajo ya
  hecho).
- **IA**: 1.000 conversaciones al mes por hotel incluidas; después, 0,05 € cada una. Con un
  modelo barato de API una conversación cuesta 0,002-0,02 €.
- **Sin comisión** sobre reservas directas. La pasarela cobra lo suyo al hotel.
- **La implantación se cobra** porque es trabajo humano (migración, configuración, formación):
  149 € son ~4 h, 490 € ~14 h, 1.490 € ~40 h a coste interno. Gratis sale caro y atrae curiosos.

Los identificadores (`starter`, `pro`, `group`) y los paquetes coinciden con los del producto
(`PLAN_PACKAGES` en `@domain/features.ts`): lo que se vende es exactamente lo que el servidor
activa. Si cambia allí, hay que actualizar `plans.ts` aquí (el sitio no importa el producto).

### Ejemplos

| Hotel                       | Nosotros                  | Competencia aproximada                              |
| --------------------------- | ------------------------- | --------------------------------------------------- |
| Hostal de 12 habitaciones   | Esencial: 69 €/mes        | Little Hotelier ~100 € + 1 % por reserva            |
| Boutique de 25 habitaciones | Esencial 100 €, Pro 225 € | Cloudbeds ~330-420 €/mes (sin chatbot)              |
| Independiente de 40 hab.    | Profesional: 360 €/mes    | Cloudbeds ~450 € + chatbot (HiJiffy 159 €) = ~600 € |
| Grupo, 2 hoteles, 120 hab.  | Grupo: 960 €/mes          | Mews ~1.100-1.700 €/mes (9-14 €/hab.) más módulos   |

## Rentabilidad (dos personas a tiempo completo)

Modelo en `plans.ts` (`COSTS`, `SERVE_COST`, `TYPICAL_MIX`, `unitEconomics()`); los tests fallan si
un cambio de precios lo rompe.

**Costes al mes**

| Concepto                                                                  | €          |
| ------------------------------------------------------------------------- | ---------- |
| Equipo: 2 × 42.000 € brutos/año + Seguridad Social de empresa             | 9.200      |
| Fijos: Supabase con PITR, IA base, monitorización, gestoría, seguro, etc. | 900        |
| **Total**                                                                 | **10.100** |

Hora interna ≈ 35 € (equipo / ~260 h productivas al mes). Coste de atender cada contrato al mes:
Esencial 1 h de soporte + 3 € variables; Profesional 1,5 h + 15 € (IA incluida); Grupo 6 h + 80 €
(guardia y PITR). El mínimo de cada plan cubre ese coste con al menos un 50 % de margen.

**Con la mezcla esperada** (40 % Esencial de 20 hab., 50 % Profesional de 35 hab., 10 % Grupo de
2 hoteles y 120 hab.; ingreso medio ≈ 285 €/mes por contrato):

- **Punto muerto: 38 hoteles** (≈ 10.800 € al mes).
- **20 % de margen: 48 hoteles** (≈ 13.700 € al mes), con ~84 h de soporte al mes: cabe en la
  mitad del tiempo de dos personas (150 h). El resto va a producto y ventas.
- Si casi todos fueran hostales pequeños (70 % Esencial), harían falta ~60 para el punto muerto y
  ~75 para el margen: el negocio depende de vender Profesional.
- Con los precios anteriores (4/7/6 €, mínimos 49/119/390) el punto muerto estaba en 49 hoteles
  y el soporte de Esencial no se pagaba.

**No incluye**: coste de captación (ferias, anuncios, comisiones de partners), impuestos sobre el
beneficio ni sueldos por encima de 42.000 €. Los 10 fundadores (−25 % durante un año) retrasan el
punto muerto unos pocos hoteles durante ese año.

## Competencia (septiembre 2026, fuentes públicas)

- **Mews**: presupuesto a medida; ~8-15 €/hab./mes con mínimo de ~300 $/mes. [roommaster](https://www.roommaster.com/blog/mews-pricing), [Hotel Tech Report](https://hoteltechreport.com/operations/property-management-systems/mews)
- **Cloudbeds**: presupuesto a medida; ~15 $/hab./mes, planes de ~180-320 $/mes; hotel mediano con módulos 750-1.800 $/mes. [roommaster](https://www.roommaster.com/blog/cloudbeds-pricing), [costbench](https://costbench.com/software/hotel-management/cloudbeds/)
- **Little Hotelier**: desde 29 $/mes + 1 % por reserva; Pro desde 109 $/mes. [Hotel Tech Report](https://hoteltechreport.com/operations/hotel-management-software/little-hotelier)
- **Avirato** (España): presupuesto; implantación 500-3.000 €, mantenimiento 500-5.000 €/año. [comparasoftware](https://www.comparasoftware.com/avirato-pms-hotel)
- **Chatbots de hotel** (lo que cubre nuestro paquete IA): HiJiffy 99-319 €/mes + alta; Asksuite ~150-300 $/mes. [Hotel Tech Report](https://hoteltechreport.com/marketing/hotel-chatbots/hijiffy-hotel-chatbot), [hyperleap](https://hyperleap.ai/comparison/best-asksuite-alternatives-2026)
- **Disponibilidad habitual**: channel managers ≥ 99,5 %; los mejores, 99,9 %. [aiosell](https://aiosell.com/blog/channel-manager-slas-what-to-look-for/)

## SLA

|                   | Esencial               | Profesional            | Grupo                              |
| ----------------- | ---------------------- | ---------------------- | ---------------------------------- |
| Disponibilidad    | 99,5 % (≤ 216 min/mes) | 99,7 % (≤ 130 min/mes) | 99,9 % (≤ 43 min/mes)              |
| Soporte           | Chat y email, L-V 9-18 | + teléfono, todos 8-22 | Guardia 24/7 en críticas           |
| Respuesta crítica | 4 h laborables         | 1 h                    | 30 min                             |
| Respuesta alta    | 1 día laborable        | 4 h                    | 2 h                                |
| RPO / RTO         | 24 h / 8 h             | 24 h / 4 h             | 5 min / 2 h                        |
| Además            |                        |                        | Gestor de cuenta, salida sin coste |

**Compensación** (automática en la siguiente factura): 10 % por debajo del compromiso, 25 % por
debajo del 99 %, 50 % por debajo del 98 % (tope). **Exclusiones**: mantenimiento avisado con 48 h
entre 2:00 y 6:00 (máx. 4 h/mes), fallos de terceros (pasarelas, OTAs, proveedores de IA) y de
la conexión del hotel.

## Antes de firmar el primer contrato (decisiones de Dan)

1. **La infraestructura tiene que respaldar el SLA.** Supabase solo da SLA de disponibilidad en
   planes de empresa; en Pro no hay compromiso contractual. El 99,5-99,7 % es asumible (la media
   real de Supabase suele estar por encima), el 99,9 % de Grupo lo asumimos nosotros sin respaldo.
   Mínimo para producción: Supabase **Pro** + **PITR** (necesario para el RPO de 5 min de Grupo;
   es un complemento de pago por proyecto). Un solo cliente Grupo lo cubre.
2. **Guardia 24/7 con un equipo de dos personas** es un compromiso real: activarlo solo cuando
   haya un cliente Grupo, con turnos y una alerta que despierte a alguien (monitor externo de
   disponibilidad + página de estado pública, que además sirve para medir el SLA).
3. **Sueldos del modelo**: 42.000 € brutos por persona. Si al principio cobráis menos, el punto
   muerto baja; cambiad `COSTS.team` y los tests dicen si los precios siguen aguantando.
4. **Distribución**: hoy solo existe el adaptador de pruebas. La web dice que los conectores
   concretos «se acuerdan en la implantación»; no vender Booking.com/Expedia directos hasta
   elegir proveedor.
5. **Textos legales**: la política de privacidad tiene huecos para la razón social. Completar
   antes de publicar. Las condiciones del SLA deben ir en el contrato, no solo en la web.
