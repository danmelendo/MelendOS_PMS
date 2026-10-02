# Textos legales de la web comercial (os.melendo.app)

_Borrador v0.1 · 02/10/2026. Para publicar **cuando exista el alta de autónomo**. Hasta entonces, la web sigue con su privacidad sin datos de titular (decisión de Dan del 27/09/2026, comentario en `site/src/pages/Privacy.tsx`)._

Cambios en la web cuando toque:

- **Aviso legal** como página nueva, enlazada en el pie.
- Completar la **privacidad** existente con el titular.
- **Cookies**: la web comercial no usa cookies de terceros, pero guarda el origen de la campaña en la sesión (ver abajo). Si se añade analítica, banner de consentimiento.

---

## Aviso legal

En cumplimiento del art. 10 de la Ley 34/2002, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI):

- **Titular**: [NOMBRE Y APELLIDOS], que opera con el nombre comercial **Melend/OS**.
- **NIF**: [NIF].
- **Domicilio**: [DOMICILIO], 28[XXX] Alcalá de Henares (Madrid).
- **Email**: [EMAIL] · **Teléfono**: [TELÉFONO].
- **Actividad**: desarrollo y prestación de software de gestión para alojamientos (software como servicio).

**Condiciones de uso**:

- Esta web informa sobre Melend/OS y permite pedir una demostración.
- Los precios publicados son para empresas y profesionales y no incluyen IVA.
- La contratación se formaliza con una hoja de pedido y las condiciones generales del servicio, que se entregan antes de firmar.

**Propiedad intelectual**: los textos, diseños, logotipos y el software de esta web son del titular o de sus licenciantes. No se permite reproducirlos sin autorización, salvo para uso personal o para valorar la contratación.

**Responsabilidad**: el titular procura que la información sea exacta y esté actualizada, pero no responde de errores puntuales ni del contenido de webs de terceros enlazadas.

**Ley aplicable**: española. Juzgados de Alcalá de Henares, salvo que la ley disponga otro fuero.

---

## Política de privacidad (sustituye a la sección «Responsable» actual)

**Responsable**: [NOMBRE Y APELLIDOS] (Melend/OS), NIF [NIF], [DOMICILIO], Alcalá de Henares. Contacto de privacidad: [EMAIL DE PRIVACIDAD].

_El resto de la política actual (datos, base legal, conservación, destinatarios y derechos) se mantiene, con dos cambios:_

- **Destinatarios**: añadir «No hay transferencias internacionales fuera de las garantías del RGPD. Algunos proveedores son empresas de EE. UU. adheridas al Marco de Privacidad de Datos UE-EE. UU. o vinculadas por cláusulas contractuales tipo».
- **Clientes**: añadir «Si contratas Melend/OS, tratamos tus datos de contacto y facturación para gestionar el contrato (base: ejecución del contrato) y los conservamos el plazo que exigen las normas mercantiles y fiscales. Los datos de los huéspedes de tu alojamiento los tratamos como encargado, según el contrato de encargo que firmamos contigo».

---

## Política de cookies

Esta web no instala cookies de analítica ni de publicidad. Usa:

- **Almacenamiento de sesión** (`sessionStorage`, clave `ds-attribution`): guarda la campaña o la web desde la que llegaste (parámetros `utm_*`) mientras dura la visita. Se envía con el formulario de demostración, si lo rellenas, y se borra al cerrar la pestaña.

_[Nota para el abogado: no es estrictamente técnico, porque sirve para medir campañas. Valorar si basta informar o hay que pedir consentimiento antes de guardarlo; en ese caso, cambiar `rememberAttribution()` en `site/src/lib/api.ts`. Si se instala Google Tag Manager, recibiría el evento `generate_lead` sin datos personales, y entonces sí haría falta banner.]_ Si en el futuro las usamos, te pediremos el consentimiento antes, con un aviso que te permitirá aceptarlas, rechazarlas o configurarlas.
