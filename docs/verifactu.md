# Facturación VERI\*FACTU

El Reglamento de sistemas informáticos de facturación (RD 1007/2023) y la Orden HAC/1177/2024 obligan a que cada factura genere un **registro de facturación** encadenado con una huella SHA-256. En la modalidad **VERI\*FACTU**, ese registro se envía a la AEAT al momento y la factura lleva un **QR tributario** con el que el cliente la coteja en la sede electrónica.

Melend/OS solo funciona en modalidad VERI\*FACTU, así que no lleva registro de eventos ni firma XAdES (esos requisitos son de la modalidad «NO VERI\*FACTU»). Cada hotel es una «facturación» del sistema: tiene su propio número de instalación y su propia cadena de huellas (`IndicadorMultiplesOT = N`, `TipoUsoPosibleMultiOT = S`).

Fuentes: documentación de la AEAT para desarrolladores (sede → Sistemas Informáticos de Facturación y VERI\*FACTU):

- descripción del servicio web v1.0.3;
- especificaciones de la huella v0.1.2, cuyos tres ejemplos oficiales son tests del proyecto;
- especificaciones del QR v0.5.0;
- FAQ para desarrolladores (04/12/2025);
- WSDL y XSD v1.0.

El XML generado se ha validado contra los XSD oficiales (`SuministroLR.xsd` y `SuministroInformacion.xsd`) en todos los casos: F1 con destinatario extranjero, F2, F3, R1 con subsanación, R5 y anulación sin registro previo.

## Flujo

```
Cuenta de la estancia ── «Factura simplificada» / «Factura con datos del cliente»
        │ issue_invoice() — en una transacción:
        │   factura (tax_invoices, inmutable) + registro de alta (verifactu_records)
        │   número correlativo por serie y año, huella encadenada al registro anterior
        ▼
verifactu_tick (pg_cron cada minuto) → verifactu-dispatch → AEAT (SOAP, TLS mutuo con el certificado del hotel)
        │ respeta TiempoEsperaEnvio (60 s por defecto) salvo que haya 1.000 registros
        ▼
estado de cada registro: accepted · accepted_with_errors · rejected (+ código, descripción) y CSV del envío
```

| Operación                   | Función SQL                       | Tipo / registro                                                                                                  |
| --------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Factura de una estancia     | `issue_invoice`                   | F2 sin destinatario (hasta el límite), F1 con él                                                                 |
| Canje de simplificada       | `exchange_simplified_invoice`     | F3 con `FacturasSustituidas`; la F2 queda canjeada                                                               |
| Rectificar por diferencias  | `rectify_invoice`                 | R1 (de F1/F3) o R5 (de F2), `TipoRectificativa = I`                                                              |
| Anular (expedida por error) | `cancel_invoice` (solo dirección) | Registro de anulación (`SinRegistroPrevio` si la AEAT nunca la registró)                                         |
| Reenviar tras un rechazo    | `resubmit_invoice`                | Alta con `Subsanacion = S` (+ `RechazoPrevio = X` si fue rechazada), con el destinatario corregido si hace falta |

Líneas de la factura (`invoice_lines_for`): el alojamiento (total de la reserva menos los extras), los extras de la reserva y los cargos confirmados de la cuenta. Los precios llevan el IVA incluido, y la base de cada tipo se calcula una vez sobre el total de ese tipo, de modo que base más cuota es siempre lo que paga el huésped. IVA por defecto: 10 % en alojamiento y comida, 21 % en el resto. Cada hotel puede cambiarlo en `settings.fiscal.vat_rates`. La regla vive en `@domain/invoicing.ts`, con su espejo SQL y un test de paridad.

## Garantías

- Una factura emitida y su registro no se modifican ni se borran: lo impiden los triggers, también para el propietario de la base. Solo cambian el estado de la factura (canjeada o anulada) y la respuesta de la AEAT.
- La cadena de registros de cada entorno es independiente. Las facturas que no son de producción van en series «P…», así que las pruebas no consumen números reales.
- Con VERI\*FACTU activo en producción no se puede desactivar ni cambiar de entorno desde el panel, porque la norma no permite usar el sistema a voluntad. El NIF del emisor tampoco cambia una vez que hay registros.
- El certificado (PEM, certificado y clave) está en Vault (`verifactu/<tenant>`) y solo lo lee el servidor.
- Solo en el entorno simulado, y solo con la clave de servicio, `purge_simulated_invoices` borra los datos de prueba (lo usan los e2e).

## Configuración por hotel

En el panel, «Facturas» → «Configuración fiscal» (solo dirección):

- NIF y razón social del emisor, y domicilio fiscal.
- Límite de la factura simplificada: 400 € con carácter general y hasta 3.000 € según la actividad.
- Entorno: **Simulado** (la demo), **Pruebas de la AEAT** o **Producción**.
- Certificado electrónico cualificado en PEM. Si está en `.p12`: `openssl pkcs12 -in cert.p12 -clcerts -nokeys` para el certificado y `openssl pkcs12 -in cert.p12 -nocerts -nodes` para la clave.

Por proyecto de Supabase, una sola vez:

- `set -a; . ./.env; set +a; node scripts/verifactu-setup.mjs`: crea la clave del envío programado (`VERIFACTU_CRON_KEY` y Vault).
- Secretos `VERIFACTU_PRODUCER_NAME` y `VERIFACTU_PRODUCER_NIF`: identifican al fabricante del sistema en cada registro. Son obligatorios fuera del entorno simulado.

## Pruebas

- Unitarias (`_shared/verifactu/verifactu.test.ts`): la huella con los ejemplos de la AEAT, el desglose de IVA, NIF y CIF, el QR con el ejemplo de la AEAT, el orden del XML, la lectura de respuestas y errores SOAP, la AEAT simulada y el dispatcher (control de flujo, errores, rechazos).
- Base de datos (bloque «invoices with VERI\*FACTU» de `rls.test.ts`): paridad SQL↔TS (huella, IVA, desglose), el ciclo F2 → F3 → R1 → anulación, la cadena, la inmutabilidad, los permisos, el bloqueo en producción y el certificado.
- De extremo a extremo contra la demo: `node --env-file=.env scripts/e2e-verifactu.mjs`.

## Pendiente: verificar contra la AEAT

Todo lo anterior funciona contra la AEAT simulada. Falta probarlo en el portal de pruebas externas de la AEAT (`prewww1.aeat.es`), para lo que hace falta:

1. Un certificado electrónico cualificado (de un hotel o del fabricante, como colaborador social o apoderado).
2. Los secretos del fabricante (`VERIFACTU_PRODUCER_NAME` y `VERIFACTU_PRODUCER_NIF`) y la declaración responsable del sistema.
3. Comprobar que el entorno de Edge Functions admite certificado de cliente (`Deno.createHttpClient({ cert, key })`). Si no lo admite, habría que enviar desde un pequeño servicio aparte.
4. Revisar con la lista de validaciones y errores de la AEAT los códigos que devuelva, en especial NIF no censados y coherencia de importes.

Fuera de alcance por ahora:

- IGIC (Canarias): el esquema lo admite como impuesto 03, pero no está implementado.
- Territorios forales: TicketBAI y Batuz son otro sistema.
- Consulta de registros presentados, que es una operación opcional del servicio.
