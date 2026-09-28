import { Layout } from "../components/Layout";
import { PAGES } from "../config";

export function NotFoundPage() {
  return (
    <Layout page="notfound">
      <section className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
        <p className="text-sm font-semibold text-gold-foreground">Error 404</p>
        <h1 className="font-display mt-3 text-[3rem]">Esta página no existe</h1>
        <p className="mt-3 text-muted-foreground">
          Puede que el enlace esté mal o que la hayamos movido.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href={PAGES.home} className="btn btn-night">
            Ir al inicio
          </a>
          <a href={PAGES.pricing} className="btn btn-quiet">
            Ver precios
          </a>
        </div>
      </section>
    </Layout>
  );
}
