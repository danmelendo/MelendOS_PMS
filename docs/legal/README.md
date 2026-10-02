# Modelos de contrato de Melend/OS

_02/10/2026. Borradores para el primer cliente (`clientes/hoteles-alcala/`). **No son asesoramiento legal: un abogado tiene que revisarlos antes de firmar.** Están redactados para contratación **entre empresas** (el hotel es empresario o profesional), no con consumidores._

## Qué se firma y cómo

| Documento                                              | Qué es                                                                                                                                                                                       | Cómo se acepta                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`hoja-de-pedido.md`](hoja-de-pedido.md)               | **Condiciones particulares**: quién contrata, plan, precio, descuentos, prueba, fechas. Es lo único que cambia de un cliente a otro.                                                         | Firma de los dos (en papel o con firma electrónica).                               |
| [`condiciones-generales.md`](condiciones-generales.md) | **Condiciones generales del servicio (SaaS)**, con la **licencia de uso** del programa (cap. 3), las **cuotas no reembolsables** (cap. 6), la responsabilidad y la baja. Iguales para todos. | Se adjuntan a la hoja de pedido y el cliente declara haberlas recibido y aceptado. |
| [`encargo-tratamiento.md`](encargo-tratamiento.md)     | **Contrato de encargado del tratamiento** (art. 28 del RGPD y art. 33 de la LOPDGDD): tratamos los datos de sus huéspedes por cuenta del hotel.                                              | Anexo de la hoja de pedido, firmado con ella.                                      |
| [`web-comercial.md`](web-comercial.md)                 | **Aviso legal, privacidad y cookies de nuestra propia web** (`os.melendo.app`), con los datos del prestador cuando exista el alta.                                                           | Se publica en la web.                                                              |

La **licencia** no va en un documento aparte. En un SaaS no se entrega una copia del programa: se da un **derecho de uso** mientras dure la suscripción. Va como capítulo de las condiciones generales, que es lo habitual. Si el abogado prefiere un «acuerdo de licencia» separado, el capítulo 3 se saca tal cual.

Las páginas legales **de la web de cada hotel** (aviso legal, privacidad, cookies, condiciones de reserva para sus huéspedes) ya las genera el producto con los datos del hotel. Ver `docs/estado-producto.md`, punto 9.

## Marco legal tenido en cuenta

- **Ley 7/1998, de Condiciones Generales de la Contratación**: las condiciones generales tienen que ser claras, entregarse antes de firmar y aceptarse expresamente. Por eso van referidas y firmadas en la hoja de pedido.
- **Código Civil y Código de Comercio**: entre empresas hay libertad de pactos, por ejemplo cuotas no reembolsables o límites de responsabilidad, con límites:
  - no se puede excluir la responsabilidad por **dolo** (art. 1102 CC);
  - en la práctica tampoco por **culpa grave**;
  - y lo pactado tiene que ser **transparente**.
- **No aplica** la Ley General de Consumidores (RDL 1/2007), porque el cliente es empresario. Si algún día se vende a un particular, habría que rehacer las cláusulas de reembolso y desistimiento.
- **RGPD (Reglamento UE 2016/679) y LOPDGDD (LO 3/2018)**: encargo del tratamiento, subencargados, transferencias internacionales y seguridad.
- **LSSI (Ley 34/2002)**: datos del prestador en la web (art. 10) y cookies (art. 22.2).
- **Normativa sectorial**: el reparto de responsabilidades de `docs/normativa-alcance.md`:
  - **SES.HOSPEDAJES**: RD 933/2021.
  - **VERI\*FACTU**: RD 1007/2023, Orden HAC/1177/2024 y RDL 15/2025, que aplaza la obligación a 2027.
- **Ley 3/2004 de morosidad**: interés de demora y gastos de cobro entre empresas.

## Antes de firmar con el primer cliente

1. **Alta de autónomo** de Dan, para tener NIF y domicilio (`clientes/hoteles-alcala/README.md`, sección 8). Rellenar los `[CORCHETES]`.
2. **Revisión del abogado**. Puntos en los que pedir opinión expresamente:
   - El **límite de responsabilidad** (cap. 9): 12 meses de cuotas. ¿Suficiente y defendible? ¿Hay que excluir los datos personales del límite?
   - **Cuotas no reembolsables** (cap. 6): que la cláusula aguante con la excepción por incumplimiento nuestro.
   - **Reparto de la normativa** (cap. 8): sobre todo VERI\*FACTU, donde somos fabricante del programa y respondemos de que cumpla.
   - **Subencargados con transferencia fuera de la UE** (anexo II del encargo): Vercel, Resend, Channex y el proveedor de IA. Comprobar su adhesión al Marco de Privacidad UE-EE. UU. o sus cláusulas contractuales tipo.
   - **Jurisdicción**: juzgados de Alcalá de Henares.
3. **Seguro de responsabilidad civil profesional** contratado antes de arrancar, y su importe coherente con el límite del cap. 9.
4. **Firmar los DPA** de Supabase, Vercel, Resend y Channex, y abrir el **registro de actividades de tratamiento** de Melend/OS (art. 30 del RGPD).
5. **Declaración responsable** del programa de facturación (VERI\*FACTU) publicada antes de que el cliente facture de verdad.
6. Actualizar `site/src/pages/Privacy.tsx` y añadir el aviso legal con los datos de `web-comercial.md`.

## Convenciones de los borradores

- `[CORCHETES]`: datos que hay que rellenar.
- Las cifras del servicio (precios, SLA, conversaciones de IA incluidas) **no se copian** en las condiciones: se remiten a la hoja de pedido y a la página de precios en vigor. Así no hay dos fuentes que se contradigan.
