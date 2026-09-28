# Qué falta para pasar a producción

_29/09/2026. Para Dan y Mercedes. No incluye la verificación de VERI\*FACTU ni de SES.HOSPEDAJES contra los entornos reales de la AEAT y del ministerio, que va aparte._

## Resumen

El producto está hecho y probado en la demo, que es la preproducción. **Lo que falta es sobre todo montar el entorno de producción y cerrar papeles.** Casi nada es código nuevo.

- **Herramientas listas (29/09):**
  - Promoción a producción con aprobación: `promote.yml`.
  - Comprobación de que un proyecto está listo: `scripts/prod-check.mjs`. Contra la demo da 14 bloqueantes, lo esperado.
  - Prueba de humo tras cada promoción y cada hora: `scripts/smoke.mjs`.
- **Calendario orientativo:**
  - Primer hotel en producción en **2-3 semanas** de trabajo si se decide pronto lo marcado como «decisión».
  - El cuello de botella son terceros: banco del hotel y abogado.

Quién hace cada cosa:

- **Dan**: cuentas, pagos, decisiones y contratos.
- **Claude**: código y configuración.
- **Tercero**: banco, abogado o asesoría.

## 1. Infraestructura (semana 1)

| #   | Qué                                                                                                                                                                                                                                                                                              | Quién        | Esfuerzo |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | -------- |
| 1.1 | **Proyecto Supabase de producción** en plan de pago, **región UE** (la demo está en Frankfurt, `eu-central-1`), con **PITR**. En una organización o cuenta propia, con un token que solo vea producción.                                                                                         | Dan          | ½ día    |
| 1.2 | **Environment `production` en GitHub** con _Required reviewers_ y sus secretos (ver `DEPLOY.md`). Primera promoción con `promote.yml`: aplica las migraciones y despliega las funciones, sin datos de la demo.                                                                                   | Dan + Claude | ½ día    |
| 1.3 | **Configuración única del proyecto**: tareas programadas y sus claves (`scripts/*-setup.mjs`), secretos de las funciones (sin `DEMO_ACCESS`), Auth (registro cerrado, Site URL, Redirect URLs, contraseñas de 10+ caracteres) y **SMTP propio** con Resend (melendo.app ya está verificado ahí). | Claude       | ½ día    |
| 1.4 | **Frontend publicado.** **Decisión**: Vercel (API de dominios) o Cloudflare for SaaS (dominios de los hoteles). Proyecto aparte del de la web comercial, con las variables de producción, y dominio del panel (p. ej. `app.melendo.app`).                                                        | Dan + Claude | 1 día    |
| 1.5 | **DNS**: comodín `*.reservas.melendo.app` hacia el hosting y certificados automáticos. Para los hoteles con dominio propio, CNAME y alta del dominio en el hosting (manual al principio).                                                                                                        | Dan + Claude | ½ día    |
| 1.6 | **Alertas de producción**: hoy `ops-alerts.yml`, el lake y el keep-alive leen los secretos de la demo. Hay que apuntarlos también a producción (secretos por environment) y apagar el keep-alive en producción, que no se pausa.                                                                 | Claude       | ½ día    |
| 1.7 | **Simulacro de restauración**: restaurar desde PITR a un proyecto temporal y comprobar datos, funciones y Vault (los secretos de las pasarelas). Dejar el procedimiento escrito.                                                                                                                 | Claude + Dan | ½ día    |
| 1.8 | `prod-check.mjs` **sin bloqueantes** y `smoke.mjs --production` en verde.                                                                                                                                                                                                                        | Claude       | —        |

## 2. Producto: lo que conviene hacer antes del primer hotel

| #   | Qué                                                                                                                                                                                                                                                                                                                                                                                          | Quién        | Esfuerzo |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------- |
| 2.1 | **Informe del pentest del becario** y arreglo de lo que encuentre. En la base de la demo no se vieron cambios anómalos (revisión del 28/09), pero sus hallazgos son la mejor lista de riesgos antes de abrir.                                                                                                                                                                                | Dan → Claude | 1-2 días |
| 2.2 | **Hecho (PR #62).** La web del huésped descargaba todo el panel; ahora cada página carga su código y `/web` baja de 534 a 264 KB comprimidos.                                                                                                                                                                                                                                                | Claude       | —        |
| 2.3 | **Hecho (PR #63 y #65).** Aviso al hotel de lo que tiene que arreglar él (partes de viajeros bloqueados o rechazados, facturas rechazadas por la AEAT, emails que no llegaron, canales que rechazan envíos): recuadro «Necesita tu atención» en «Hoy» y **email a dirección** una vez por problema (se revisa cada 15 min; en producción sale con Resend y enlaza al panel con `PANEL_URL`). | Claude       | —        |
| 2.4 | **Decisión**: ¿verificación en dos pasos obligatoria para dirección? Está hecha y es opcional. Recomendado: obligatoria para dirección y dirección de grupo, porque ven datos de identidad.                                                                                                                                                                                                  | Dan          | ½ día    |
| 2.5 | **Decisión**: remitente de los emails al huésped. Propuesta: `reservas@melendo.app` con el nombre del hotel y respuesta al email del hotel (ya funciona así), o el dominio de cada hotel si lo pide (más soporte).                                                                                                                                                                           | Dan          | —        |
| 2.6 | **Asistente IA con un proveedor de API** (solo si el primer hotel compra el paquete IA). Hoy usa el modelo local del PC de Dan. **Decisión**: proveedor. Después, evals contra él (`EVAL_*`) y coste por turno medido en «Actividad y consumo».                                                                                                                                              | Dan + Claude | 1 día    |

## 3. Pagos con el primer hotel

| #   | Qué                                                                                                                                                                    | Quién          | Esfuerzo     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------ |
| 3.1 | **TPV virtual del hotel** (Redsys en real, con su banco) o su cuenta de Stripe. Guardar sus credenciales en Vault desde el panel y pasar la pasarela a modo real.      | Hotel + banco  | días (banco) |
| 3.2 | **Prueba real de poco importe**: pago y devolución desde el panel. Redsys ya está probado de punta a punta en su entorno de pruebas (pago y devolución en dos partes). | Claude + hotel | ½ día        |
| 3.3 | Si el hotel usa Stripe: probar primero con claves de prueba. Está implementado pero sin probar.                                                                        | Claude         | ½ día        |

## 4. Alta del primer hotel

| #   | Qué                                                                                                                                                                               | Quién          | Esfuerzo |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------- |
| 4.1 | Recoger sus datos (lo que pide el JSON de `docs/alta-hotel.md` y su hoja de habitaciones): hotel, habitaciones, tarifas, políticas, personal, datos fiscales y reservas en curso. | Dan + hotel    | ½ día    |
| 4.2 | `create-hotel.ts --apply` e `import-reservations.ts --apply` en producción. Invitación al personal y primera entrada con contraseña y verificación en dos pasos.                  | Claude         | ½ día    |
| 4.3 | Web: subdominio o dominio propio, fotos y textos (también en inglés), páginas legales con sus datos, y el widget en su web si ya tiene una.                                       | Claude + hotel | ½-1 día  |
| 4.4 | Formación corta (1 h) y una semana de **doble registro** con su sistema anterior antes de apagarlo.                                                                               | Dan            | —        |

## 5. Papeles y negocio (en paralelo, desde ya)

| #   | Qué                                                                                                                                                                                                   | Quién          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 5.1 | **Contrato con el hotel**: condiciones del servicio, **encargo del tratamiento** (RGPD, art. 28) y el reparto de responsabilidades de la normativa (`docs/normativa-alcance.md`).                     | Dan + abogado  |
| 5.2 | **Revisión legal de las plantillas** de la web de cada hotel (aviso legal, privacidad, cookies, condiciones de reserva).                                                                              | Abogado        |
| 5.3 | **Subencargados** en el contrato y en la privacidad: Supabase (firmar su DPA), el hosting del frontend, Resend y, si se usa, el proveedor de IA. Registro de actividades de tratamiento de Melend/OS. | Dan            |
| 5.4 | Alta como autónomo o sociedad cuando haya cliente (ya decidido), facturación de la cuota (manual al principio; Stripe Billing más adelante) y valorar un seguro de responsabilidad civil profesional. | Dan + asesoría |
| 5.5 | **Soporte**: canal (email y teléfono), horario y qué es una incidencia urgente. Coherente con los niveles de SLA de la web comercial.                                                                 | Dan            |

## Orden recomendado

1. **Esta semana:**
   - Decidir hosting (1.4), 2FA (2.4), remitente (2.5) y proveedor de IA (2.6).
   - Pedir al becario el informe del pentest (2.1).
   - Poner en marcha los papeles (5.1-5.3).
2. **Semana 1:**
   - Infraestructura completa (1.1-1.8).
   - En paralelo, 2.2 y 2.3.
3. **Semana 2:**
   - Arreglos del pentest.
   - Alta del primer hotel en producción con su pasarela en pruebas (4.1-4.3).
4. **Semana 3:**
   - Pasarela en real (3.1-3.2), formación y doble registro (4.4).

## No hace falta para el primer hotel

- **Channel manager real** (Booking, Expedia): hace falta para vender a muchos hoteles, pero no para abrir con uno que no lo necesite o que siga con su channel manager actual.
- **Consola interna**: los scripts de alta bastan para los primeros hoteles.
- **Cobro automático de la suscripción**: se puede facturar a mano los primeros meses.
- **Informes agregados en SQL**: solo para hoteles grandes.
- **Predicciones de ML** (Mercedes), API pública, VoIP y la garantía con tarjeta de las reservas con pago en el hotel.

Ver también: `DEPLOY.md` (cómo se despliega), `docs/estado-producto.md` (qué hay hecho) y `docs/alta-hotel.md` (alta de un hotel).
