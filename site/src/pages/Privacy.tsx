import { Layout } from "../components/Layout";
import { BRAND, PRIVACY_EMAIL } from "../config";

// Privacy notice for the lead forms. Melend/OS has no company yet (Dan,
// 27/09/2026: "nada de datos de empresa que aún no existen"), so it names the
// project and its privacy address; add the legal identity when it exists.
export function PrivacyPage() {
  return (
    <Layout page="privacy">
      <article className="mx-auto max-w-3xl space-y-8 px-4 py-20 text-[0.95rem] leading-relaxed text-stone sm:px-6">
        <h1 className="font-display text-[3rem] text-foreground">Política de privacidad</h1>
        <section className="space-y-2">
          <h2 className="font-display text-[1.6rem] text-foreground">Responsable</h2>
          <p>
            El equipo de {BRAND}, un proyecto en fase de lanzamiento. Para cualquier cuestión sobre
            tus datos, escríbenos a{" "}
            <a className="font-medium underline" href={`mailto:${PRIVACY_EMAIL}`}>
              {PRIVACY_EMAIL}
            </a>
            .
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="font-display text-[1.6rem] text-foreground">
            Qué datos tratamos y para qué
          </h2>
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
          <h2 className="font-display text-[1.6rem] text-foreground">Base legal y conservación</h2>
          <p>
            Tu consentimiento y las medidas precontractuales que nos pides. Conservamos los datos
            mientras dure la relación comercial y, si no llega a haberla, un máximo de 12 meses.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="font-display text-[1.6rem] text-foreground">Quién más los ve</h2>
          <p>
            Los proveedores que nos prestan el servicio, como encargados del tratamiento: el
            alojamiento de la web (Vercel), la base de datos (Supabase) y el envío de emails
            (Resend). No vendemos ni cedemos tus datos.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="font-display text-[1.6rem] text-foreground">Tus derechos</h2>
          <p>
            Acceso, rectificación, supresión, oposición, limitación y portabilidad, y retirar tu
            consentimiento o darte de baja de las novedades en cualquier momento, escribiendo a{" "}
            <a className="font-medium underline" href={`mailto:${PRIVACY_EMAIL}`}>
              {PRIVACY_EMAIL}
            </a>
            . Si no quedas satisfecho, puedes reclamar ante la Agencia Española de Protección de
            Datos (aepd.es).
          </p>
        </section>
      </article>
    </Layout>
  );
}
