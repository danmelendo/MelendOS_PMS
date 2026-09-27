# Normativa: qué hace Melend/OS y qué hace el alojamiento

Alcance de SES.HOSPEDAJES (registro de viajeros) y VERI\*FACTU (facturación), para que quede claro qué hace el programa y qué sigue siendo responsabilidad del establecimiento. **No es asesoramiento legal.** Antes de firmar con el primer cliente hay que revisar este reparto con un abogado y pasarlo a las condiciones del contrato.

## Principio

Melend/OS es **el programa**, no la gestoría. Prepara, valida, envía y conserva las comunicaciones y los registros con las credenciales del propio alojamiento, y avisa de lo que falta o se ha rechazado. Pero **el obligado ante la Administración sigue siendo el alojamiento**:

- **SES.HOSPEDAJES**: el alojamiento es el «sujeto obligado» del Real Decreto 933/2021.
- **VeriFactu**: el alojamiento es el «obligado tributario» que expide las facturas (RD 1007/2023).

Nosotros somos:

- **Fabricante del sistema de facturación (SIF)**: firmamos la declaración responsable de que el programa cumple el RD 1007/2023 y la Orden HAC/1177/2024. Si el programa no cumpliera, la sanción al fabricante es de 150.000 € por ejercicio y tipo de sistema. Al usuario de un programa no conforme le corresponden 50.000 € por ejercicio. Ambas están en el art. 201 bis de la Ley General Tributaria, introducido por la Ley 11/2021 ([Iberley][lgt]).
- **Encargados del tratamiento** de los datos de los huéspedes (RGPD), con contrato de encargo incluido en todos los planes.

## Reparto de responsabilidades

| Tarea                                                                       | Alojamiento                   | Melend/OS                                                               |
| --------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| Darse de alta en la sede de SES.HOSPEDAJES (arrendador y establecimientos)  | ✔                             | Guía paso a paso                                                        |
| Obtener y custodiar el usuario y la contraseña del servicio web de SES      | ✔ (los introduce en el panel) | Los guarda cifrados y solo los usa el servidor                          |
| Pedir y comprobar el documento de cada viajero en el check-in               | ✔                             | Formulario con validación (DNI, NIE, menores, INE…)                     |
| Veracidad de los datos introducidos                                         | ✔                             | —                                                                       |
| Generar, enviar y reintentar las comunicaciones en 24 h                     | —                             | ✔ (automático, con avisos de plazo)                                     |
| Corregir lo que el ministerio rechace                                       | ✔ (corrige los datos)         | ✔ (muestra el motivo y reenvía)                                         |
| Certificado electrónico cualificado para la AEAT                            | ✔ (lo obtiene y lo sube)      | Lo guarda cifrado y solo lo usa el servidor                             |
| Decidir el IVA de cada concepto, la simplificada y sus límites              | ✔ (con su gestoría)           | Valores por defecto configurables                                       |
| Expedir la factura correcta (datos del cliente, rectificativas)             | ✔                             | Numeración, encadenado, QR y envío automáticos                          |
| Que el programa cumpla VeriFactu (huella, cadena, QR, envío, inmutabilidad) | —                             | ✔ (declaración responsable)                                             |
| Conservar los registros (SES: 3 años; facturas: los plazos fiscales)        | ✔ (es su obligación)          | ✔ (los conserva mientras sea cliente y entrega una exportación al irse) |
| Presentar impuestos o declaraciones, asesoramiento fiscal o legal           | Su gestoría                   | No lo hacemos                                                           |

## Qué tiene que darnos el alojamiento para activarlo

**SES.HOSPEDAJES** (Registro de viajeros → Configuración):

1. Código de arrendador y código de cada establecimiento, que obtiene al darse de alta en `hospedajes.ses.mir.es`.
2. Usuario y contraseña del servicio web, y el certificado del servicio si el ministerio lo pide.
3. Comunicar a su personal que el check-in no se completa sin los datos de todos los viajeros.

**VeriFactu** (Facturas → Configuración fiscal):

1. NIF, razón social y domicilio fiscal.
2. Certificado electrónico cualificado (de la empresa o de su representante) en formato PEM. La guía de conversión desde `.p12` está en el panel.
3. Los tipos de IVA y el límite de la factura simplificada, revisados con su gestoría.

## Lo que no hacemos (y conviene decir claramente)

- No damos de alta al alojamiento en las sedes ni actuamos en su nombre ante la Administración. Hacerlo como representante o colaborador social es posible, pero sería un servicio aparte, con contrato y más responsabilidad. No está en los planes.
- No revisamos ni corregimos los datos que introduce el personal, ni decidimos cómo facturar un concepto.
- No respondemos de sanciones por datos falsos o incompletos, por no hacer el check-in en el programa o por comunicaciones fuera de plazo por causas del alojamiento. Sí respondemos de que el programa cumpla la norma.

## Para el contrato (pendiente)

- Cláusula de reparto de responsabilidades (la tabla de arriba).
- Contrato de encargado del tratamiento con las categorías de datos (identidad, documento, domicilio, contacto) y los subencargados (Supabase, Vercel y el proveedor de email).
- Declaración responsable del SIF publicada y referida en el contrato.
- Valorar un seguro de responsabilidad civil profesional cuando haya clientes.

[lgt]: https://www.iberley.es/legislacion/articulo-201-bis-ley-general-tributaria
