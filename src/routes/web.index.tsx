import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Star, MapPin, ArrowRight, Phone, Mail } from "lucide-react";
import { pms } from "@/integrations/pms";
import { useBrand } from "@/lib/brand";
import { HotelCoverArt } from "@/components/cover-art";
import { accentGradient, eur0, priceBand, AMENITY_LABELS } from "@/lib/stays";
import { useLang } from "@/lib/i18n";
import { brandCopy } from "@/lib/hotel-web";

export const Route = createFileRoute("/web/")({
  component: WebHome,
});

function WebHome() {
  const { brand, brandId, tenantId } = useBrand();
  const { data: hotels } = useQuery({
    queryKey: ["pms", "properties-web", brandId],
    enabled: !!tenantId,
    queryFn: () => pms.listProperties({ tenantId: tenantId ?? undefined }),
  });
  const main = hotels?.[0];
  const { t, lang } = useLang();
  const copy = brandCopy(brand, lang);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        {brand.heroImageUrl ? (
          <img
            src={brand.heroImageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: accentGradient(brand.heroAccent) }}
          />
        )}
        <div className={`absolute inset-0 ${brand.heroImageUrl ? "bg-black/45" : "bg-black/20"}`} />
        <div className="relative mx-auto max-w-6xl px-5 py-20 text-white sm:py-28">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/80">
            {copy.eyebrow}
          </p>
          <h1 className="mt-3 max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">
            {copy.heroTitle}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-white/85">{copy.heroSubtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {main && (
              <Link
                to="/web/hotel/$hotelId"
                params={{ hotelId: main.id }}
                className="inline-flex items-center gap-2 bg-white px-6 py-3 font-semibold text-neutral-900"
              >
                {t("Ver habitaciones y precios")} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            <Link
              to="/web/mi-reserva"
              className="inline-flex items-center gap-2 border border-white/40 px-6 py-3 font-semibold text-white"
            >
              {t("Gestionar mi reserva")}
            </Link>
          </div>
        </div>
      </section>

      {/* About the hotel (template text, edited in the panel) */}
      {copy.about && (
        <section className="mx-auto max-w-6xl px-5 pt-14">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-bold tracking-tight">{t("Sobre nosotros")}</h2>
            <p className="mt-3 whitespace-pre-line text-neutral-600">{copy.about}</p>
          </div>
        </section>
      )}

      {/* Photo gallery */}
      {brand.gallery.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 pt-10">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {brand.gallery.map((src, i) => (
              <a
                key={src}
                href={src}
                target="_blank"
                rel="noreferrer"
                className={`block overflow-hidden bg-neutral-100 ${i === 0 ? "col-span-2 row-span-2" : ""}`}
              >
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  className="aspect-[4/3] h-full w-full object-cover transition hover:scale-[1.02]"
                />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* The hotel(s) of this brand */}
      <section className="mx-auto max-w-6xl px-5 py-6">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-bold tracking-tight">
            {t((hotels?.length ?? 0) > 1 ? "Nuestros hoteles" : "El hotel")}
          </h2>
          <Link to="/web/hotels" className="text-sm font-medium text-[var(--brand)]">
            {t("Ver habitaciones")}
          </Link>
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {(hotels ?? []).map((h) => (
            <Link
              key={h.id}
              to="/web/hotel/$hotelId"
              params={{ hotelId: h.id }}
              className="group overflow-hidden bg-white shadow-sm ring-1 ring-neutral-100 transition hover:shadow-md"
            >
              <div
                className="relative h-44 overflow-hidden"
                style={{ background: accentGradient(h.accent) }}
              >
                <HotelCoverArt />
                <div className="absolute inset-0 bg-black/10" />
                <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between text-white">
                  <div>
                    <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider opacity-90">
                      <MapPin className="h-3 w-3" /> {h.city} · {h.provinceName}
                    </p>
                    <h3 className="text-xl font-semibold">{h.name}</h3>
                  </div>
                  <span className="flex items-center gap-1 bg-white/90 px-2 py-0.5 text-xs font-semibold text-neutral-800">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {h.rating.toFixed(1)}
                  </span>
                </div>
              </div>
              <div className="space-y-3 px-4 py-4">
                <p className="text-sm text-neutral-600">{h.description}</p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {h.amenities.map((a) => (
                      <span
                        key={a}
                        className="bg-[var(--brand-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand)]"
                      >
                        {t(AMENITY_LABELS[a] ?? a)}
                      </span>
                    ))}
                  </div>
                  {h.fromPrice != null && (
                    <span className="shrink-0 text-sm font-semibold">
                      {t("desde")} {eur0(priceBand(h.fromPrice).from)}
                      <span className="text-xs font-normal text-neutral-400">/{t("noche")}</span>
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Where we are */}
      {(brand.address || brand.phone || brand.email) && (
        <section className="mx-auto max-w-6xl px-5 pt-14">
          <div className="grid gap-6 bg-white p-6 shadow-sm ring-1 ring-neutral-100 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <h2 className="text-xl font-bold tracking-tight">{t("Dónde estamos")}</h2>
              {brand.address && <p className="mt-2 text-neutral-600">{brand.address}</p>}
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                {brand.phone && (
                  <a
                    href={`tel:${brand.phone.replace(/\s/g, "")}`}
                    className="flex items-center gap-1.5 text-[var(--brand)]"
                  >
                    <Phone className="h-4 w-4" /> {brand.phone}
                  </a>
                )}
                {brand.email && (
                  <a
                    href={`mailto:${brand.email}`}
                    className="flex items-center gap-1.5 text-[var(--brand)]"
                  >
                    <Mail className="h-4 w-4" /> {brand.email}
                  </a>
                )}
              </div>
            </div>
            {brand.address && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(brand.address)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 border border-neutral-300 px-4 py-2 text-sm font-semibold"
              >
                <MapPin className="h-4 w-4" /> {t("Cómo llegar")}
              </a>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
