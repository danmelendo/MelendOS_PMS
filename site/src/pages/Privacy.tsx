import { Layout } from "../components/Layout";
import { SALES } from "../config";

// Privacy notice for the lead forms. The controller's legal details are
// placeholders until the company exists: fill them in before publishing.
export function PrivacyPage() {
  return (
    <Layout page="privacy">
      <article className="mx-auto max-w-3xl space-y-6 px-4 py-14 text-sm leading-relaxed sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Política de privacidad</h1>
        <p className="rounded-md border border-gold/50 bg-gold/10 p-3">
          Pendiente de completar con los datos de la sociedad antes de publicar la web.
        </p>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Responsable</h2>
          <p>
            [Razón social], NIF [NIF], con domicilio en [dirección]. Contacto:{" "}
            {SALES.email || "[email]"}.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Qué datos tratamos y para qué</h2>
          <p>
            Los que nos das en el formulario (nombre, email, teléfono, hotel y lo que nos cuentes)
            para organizar la demostración y contestarte. Si marcas la casilla de novedades, también
            para enviarte información del producto, como mucho una vez al mes.
          </p>
          <p>
            Guardamos además la campaña o la web desde la que llegaste y una huella cifrada de tu
            dirección IP, solo para evitar abusos del formulario.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Base legal y conservación</h2>
          <p>
            Tu consentimiento y las medidas precontractuales que nos pides. Conservamos los datos
            mientras dure la relación comercial y, si no llega a haberla, un máximo de 12 meses.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Quién más los ve</h2>
          <p>
            Nuestros proveedores de alojamiento y base de datos, como encargados del tratamiento. No
            vendemos ni cedemos tus datos.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Tus derechos</h2>
          <p>
            Acceso, rectificación, supresión, oposición, limitación y portabilidad, escribiendo a{" "}
            {SALES.email || "[email]"}. Si no quedas satisfecho, puedes reclamar ante la Agencia
            Española de Protección de Datos (aepd.es).
          </p>
        </section>
      </article>
    </Layout>
  );
}
