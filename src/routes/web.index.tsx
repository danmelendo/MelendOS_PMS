import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Star, MapPin, ArrowRight, Sparkles, Phone, Mail } from "lucide-react";
import { pms } from "@/integrations/pms";
import { cms } from "@/integrations/cms";
import { useBrand } from "@/lib/brand";
import { useFeatures } from "@/lib/features";
import { HotelCoverArt } from "@/components/cover-art";
import {
  accentGradient,
  eur0,
  priceBand,
  EVENT_CATEGORY_LABELS,
  AMENITY_LABELS,
} from "@/lib/stays";

export const Route = createFileRoute("/web/")({
  component: WebHome,
});

function WebHome() {
  const { brand, brandId, tenantId } = useBrand();
  const features = useFeatures();
  const { data: hotels } = useQuery({
    queryKey: ["pms", "properties-web", brandId],
    enabled: !!tenantId,
    queryFn: () => pms.listProperties({ tenantId: tenantId ?? undefined }),
  });
  const { data: events } = useQuery({
    queryKey: ["cms", "events-web"],
    queryFn: () => cms.listEvents({ upcomingOnly: true }),
  });
  const hotelIds = new Set((hotels ?? []).map((h) => h.id));
  const brandEvents = (events ?? []).filter((e) => hotelIds.has(e.hotelId));
  const main = hotels?.[0];

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
            {brand.eyebrow}
          </p>
          <h1 className="mt-3 max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">
            {brand.heroTitle}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-white/85">{brand.heroSubtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {main && (
              <Link
                to="/web/hotel/$hotelId"
                params={{ hotelId: main.id }}
                className="inline-flex items-center gap-2 bg-white px-6 py-3 font-semibold text-neutral-900"
              >
                Ver habitaciones y precios <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            <Link
              to="/web/mi-reserva"
              className="inline-flex items-center gap-2 border border-white/40 px-6 py-3 font-semibold text-white"
            >
              Gestionar mi reserva
            </Link>
          </div>
        </div>
      </section>

      {/* About the hotel (template text, edited in the panel) */}
      {brand.about && (
        <section className="mx-auto max-w-6xl px-5 pt-14">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-bold tracking-tight">Sobre nosotros</h2>
            <p className="mt-3 whitespace-pre-line text-neutral-600">{brand.about}</p>
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
            {(hotels?.length ?? 0) > 1 ? "Nuestros hoteles" : "El hotel"}
          </h2>
          <Link to="/web/hotels" className="text-sm font-medium text-[var(--brand)]">
            Ver habitaciones
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
                        {AMENITY_LABELS[a] ?? a}
                      </span>
                    ))}
                  </div>
                  {h.fromPrice != null && (
                    <span className="shrink-0 text-sm font-semibold">
                      desde {eur0(priceBand(h.fromPrice).from)}
                      <span className="text-xs font-normal text-neutral-400">/noche</span>
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
              <h2 className="text-xl font-bold tracking-tight">Dónde estamos</h2>
              {brand.address && <p className="mt-2 text-neutral-600">{brand.address}</p>}
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                {brand.phone && (
                  <a
                    href={`tel:${brand.phone.replace(/s/g, "")}`}
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
                <MapPin className="h-4 w-4" /> Cómo llegar
              </a>
            )}
          </div>
        </section>
      )}

      {/* Experiences (only when the hotel has any) */}
      {features.experiences && brandEvents.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 py-14">
          <div className="flex items-end justify-between">
            <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <Sparkles className="h-6 w-6 text-[var(--brand)]" /> Próximas experiencias
            </h2>
            <Link to="/web/events" className="text-sm font-medium text-[var(--brand)]">
              Ver agenda
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {brandEvents.slice(0, 4).map((e) => (
              <Link
                key={e.id}
                to="/web/event/$eventId"
                params={{ eventId: e.id }}
                className="overflow-hidden bg-white shadow-sm ring-1 ring-neutral-100 transition hover:shadow-md"
              >
                <div className="h-20" style={{ background: accentGradient(e.accent) }} />
                <div className="p-4">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--brand)]">
                    {EVENT_CATEGORY_LABELS[e.category]}
                  </span>
                  <h3 className="mt-1 font-semibold leading-tight">{e.title}</h3>
                  <p className="mt-1 text-xs text-neutral-500">
                    {new Date(e.startsAt).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "short",
                    })}{" "}
                    · {e.location}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
