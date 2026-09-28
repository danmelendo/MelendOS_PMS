import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useBrand } from "@/lib/brand";
import { useLang } from "@/lib/i18n";
import { isLegalPage, LEGAL_PAGES, legalPage, useHotelLegal, type LegalPage } from "@/lib/legal";

// Legal pages of the hotel's booking web: /web/legal/aviso-legal,
// /privacidad, /cookies and /condiciones (see src/lib/legal.ts).

export const Route = createFileRoute("/web/legal/$page")({
  component: LegalScreen,
  beforeLoad: ({ params }) => {
    if (!isLegalPage(params.page)) throw notFound();
  },
});

function LegalScreen() {
  const { page } = Route.useParams() as { page: LegalPage };
  const { tenantId } = useBrand();
  const { data, isLoading } = useHotelLegal(tenantId);
  const { t, lang } = useLang();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {(Object.keys(LEGAL_PAGES) as LegalPage[]).map((p) => (
          <Link
            key={p}
            to="/web/legal/$page"
            params={{ page: p }}
            className={
              p === page
                ? "font-semibold text-neutral-900"
                : "text-neutral-500 hover:text-neutral-900"
            }
          >
            {t(LEGAL_PAGES[p])}
          </Link>
        ))}
      </nav>
      <h1 className="text-3xl font-bold tracking-tight">{t(LEGAL_PAGES[page])}</h1>
      {isLoading ? null : !data ? (
        <p className="mt-6 text-neutral-500">{t("Información no disponible.")}</p>
      ) : (
        <div className="mt-6 space-y-8 bg-white p-6 shadow-sm ring-1 ring-neutral-100 sm:p-8">
          {legalPage(page, data, lang).map((s) => (
            <section key={s.heading}>
              <h2 className="text-lg font-semibold">{s.heading}</h2>
              <div className="mt-2 space-y-2 text-sm leading-relaxed text-neutral-700">
                {s.paragraphs.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
