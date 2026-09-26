# Precios y SLA: propuesta y porqué

Propuesta del 26/09/2026. Las cifras están en `supabase/functions/_shared/plans.ts` (una sola
fuente para la página de precios, la calculadora y la tabla del SLA). Precios en euros, sin IVA.

## Principio

Sin reputación en el sector, el riesgo percibido pesa más que el precio. La propuesta ataca las
dos cosas:

1. **Más barato que la competencia**: un 30-50 % por debajo a igualdad de módulos.
2. **Quitar el riesgo de probar**: precio publicado (los grandes solo dan presupuesto), sin
   permanencia, garantía de 60 días, exportación completa de datos, SLA con compensación
   automática y un programa de hoteles fundadores.

## Planes

| Plan            | €/hab./mes | Mínimo/mes | Implantación | Incluye                                          |
| --------------- | ---------- | ---------- | ------------ | ------------------------------------------------ |
| **Esencial**    | 4          | 49         | Gratis       | Base + Estancia                                  |
| **Profesional** | 7          | 119        | 290 €        | Todo (IA, Datos, Distribución, Cadena)           |
| **Grupo**       | 6          | 390        | Desde 990 €  | Todo, desde 2 hoteles, SLA 99,9 % y guardia 24/7 |

- **Paquetes sueltos sobre Esencial**: IA +2 €/hab. (mín. 29), Datos +1 € (mín. 15),
  Distribución +1,5 € (mín. 19). Con los tres, Profesional sale más barato, y la calculadora lo
  dice: empuja hacia el plan superior sin forzarlo.
- **Pago anual**: −15 %. **Fundadores**: −30 % durante 24 meses para los 10 primeros hoteles a
  cambio de sus comentarios y un caso de éxito.
- **IA**: 1.000 conversaciones al mes por hotel incluidas; después, 0,05 € cada una. Con un
  modelo barato de API una conversación cuesta 0,002-0,02 €, así que el margen cubre proveedores
  más caros.
- **Sin comisión** sobre reservas directas. La pasarela cobra lo suyo al hotel.

Los identificadores (`starter`, `pro`, `group`) y los paquetes coinciden con los del producto
(`PLAN_PACKAGES` en `@domain/features.ts`): lo que se vende es exactamente lo que el servidor
activa. Si cambia allí, hay que actualizar `plans.ts` aquí (el sitio no importa el producto).

### Ejemplos

| Hotel                       | Nosotros                  | Competencia aproximada                              |
| --------------------------- | ------------------------- | --------------------------------------------------- |
| Hostal de 12 habitaciones   | Esencial: 49 €/mes        | Little Hotelier ~100 € + 1 % por reserva            |
| Boutique de 25 habitaciones | Esencial 100 €, Pro 175 € | Cloudbeds ~330-420 €/mes                            |
| Independiente de 40 hab.    | Profesional: 280 €/mes    | Cloudbeds ~450 € + chatbot (HiJiffy 159 €) = ~600 € |
| Grupo, 2 hoteles, 120 hab.  | Grupo: 720 €/mes          | Mews ~1.100-1.700 €/mes (9-14 €/hab.) más módulos   |

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
3. **Garantía de 60 días y fundadores**: coste bajo y es lo que más convence a un hotel que no nos
   conoce, pero es dinero: confirmar.
4. **Distribución**: hoy solo existe el adaptador de pruebas. La web dice que los conectores
   concretos «se acuerdan en la implantación»; no vender Booking.com/Expedia directos hasta
   elegir proveedor.
5. **Textos legales**: la política de privacidad tiene huecos para la razón social. Completar
   antes de publicar. Las condiciones del SLA deben ir en el contrato, no solo en la web.
