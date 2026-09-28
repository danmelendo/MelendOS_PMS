import { ReviewCard, ReviewSummary } from "@/components/Reviews";
import { useReviews } from "@/lib/reviews";
import { useFeatures } from "@/lib/features";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Star, Users, ArrowRight, Sparkles, CalendarDays } from "lucide-react";
import { pms } from "@/integrations/pms";
import { HotelOffers } from "@/components/HotelOffers";
import { useBrand } from "@/lib/brand";
import {
  accentGradient,
  dateOffset,
  AMENITY_LABELS,
  ASSET_TYPE_LABELS,
  ASSET_TYPE_SHORT,
  FEATURE_LABELS,
  eur0,
} from "@/lib/stays";
import { HotelCoverArt } from "@/components/cover-art";
import { DateRangePicker } from "@/components/DateRangePicker";
import type { AssetType } from "@/integrations/pms";
import { useLang } from "@/lib/i18n";

const isYmd = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const Route = createFileRoute("/web/hotel/$hotelId")({
  component: WebHotelDetail,
  // Dates and guests can come in the link (the embedded search widget).
  validateSearch: (
    s: Record<string, unknown>,
  ): { checkIn?: string; checkOut?: string; guests?: number; promo?: string } => ({
    checkIn: isYmd(s.checkIn) ? s.checkIn : undefined,
    checkOut: isYmd(s.checkOut) ? s.checkOut : undefined,
    guests: Number(s.guests) >= 1 && Number(s.guests) <= 12 ? Number(s.guests) : undefined,
    promo: typeof s.promo === "string" && s.promo ? s.promo.slice(0, 40) : undefined,
  }),
});

const ASSET_FILTERS: { label: string; value: AssetType | null }[] = [
  { label: "Todas", value: null },
  { label: "Habitaciones", value: "room" },
  { label: "Suites", value: "suite" },
  { label: "Familiares", value: "family" },
];

function WebHotelDetail() {
  const { hotelId } = Route.useParams();
  const search = Route.useSearch();
  const valid = !!search.checkIn && !!search.checkOut && search.checkIn < search.checkOut;
  const [checkIn, setCheckIn] = useState(valid ? search.checkIn! : dateOffset(7));
  const [checkOut, setCheckOut] = useState(valid ? search.checkOut! : dateOffset(10));
  const guests = search.guests ?? 1;
  const [assetType, setAssetType] = useState<AssetType | null>(null);
  const [promo, setPromo] = useState(search.promo);
  const { tenantId } = useBrand();
  const { t } = useLang();

  const { data: hotel } = useQuery({
    queryKey: ["pms", "property", hotelId],
    queryFn: () => pms.getProperty(hotelId),
  });
  const { data: offers } = useQuery({
    queryKey: ["pms", "availability", hotelId, checkIn, checkOut, guests],
    queryFn: () => pms.searchAvailability({ propertyId: hotelId, checkIn, checkOut, guests }),
  });

  const filteredOffers = (offers ?? []).filter(
    (o) => assetType === null || o.room.assetType === assetType,
  );

  return (
    <div>
      {/* Hero */}
      <div
        className="relative h-64 overflow-hidden"
        style={{ background: hotel ? accentGradient(hotel.accent) : "#ddd" }}
      >
        <HotelCoverArt />
        <div className="absolute inset-0 bg-black/20" />
        {hotel && (
          <div className="absolute bottom-6 left-0 right-0">
            <div className="mx-auto max-w-6xl px-5 text-white">
              <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider opacity-90">
                <MapPin className="h-3.5 w-3.5" /> {hotel.provinceName} · {hotel.city}
              </p>
              <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{hotel.name}</h1>
              <p className="mt-1 flex items-center gap-1 text-sm">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {hotel.rating.toFixed(1)}{" "}
                · {hotel.address}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-6xl px-5 py-8">
        {hotel && (
          <>
            <p className="max-w-2xl text-neutral-600">{hotel.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {hotel.amenities.map((a) => (
                <span
                  key={a}
                  className=" bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600"
                >
                  {t(AMENITY_LABELS[a] ?? a)}
                </span>
              ))}
            </div>
          </>
        )}

        {/* ── Date + filter bar ── */}
        <div className="mt-8 flex flex-wrap items-end gap-4  bg-white p-4 shadow-sm ring-1 ring-neutral-100">
          <div className="w-full sm:w-72">
            <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              <CalendarDays className="h-3 w-3" /> {t("Fechas")}
            </span>
            <DateRangePicker
              checkIn={checkIn}
              checkOut={checkOut}
              pricing={{ propertyId: hotelId }}
              onChange={({ checkIn: ci, checkOut: co }) => {
                setCheckIn(ci);
                setCheckOut(co);
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {ASSET_FILTERS.map((f) => (
              <button
                key={f.label}
                onClick={() => setAssetType(f.value)}
                className={`px-3 py-2 text-sm font-medium transition ${
                  assetType === f.value
                    ? "bg-[var(--brand)] text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {t(f.label)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-3">
          {/* Assets */}
          <div id="rooms" className="scroll-mt-24 lg:col-span-2">
            <h2 className="text-xl font-bold tracking-tight">{t("Habitaciones")}</h2>
            <p className="text-sm text-neutral-500">
              {assetType
                ? t(ASSET_TYPE_LABELS[assetType])
                : t("Precio total para tus fechas, impuestos incluidos.")}
            </p>
            {promo && (
              <p className="mt-1 text-xs font-medium text-emerald-700">
                {t(
                  "Código {code} aplicado: se descuenta de la habitación al confirmar la reserva.",
                  { code: promo },
                )}
              </p>
            )}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {filteredOffers.map((o) => (
                <Link
                  key={o.room.id}
                  to="/web/room/$roomId"
                  params={{ roomId: o.room.id }}
                  search={{ hotelId, checkIn, checkOut, ...(promo ? { promo } : {}) }}
                  className="group overflow-hidden  bg-white shadow-sm ring-1 ring-neutral-100 transition hover:shadow-md"
                >
                  <div className="relative h-36 overflow-hidden bg-neutral-100">
                    {o.room.imageUrl ? (
                      <img
                        src={o.room.imageUrl}
                        alt={o.room.name}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-neutral-300">
                        <span className="text-4xl font-bold">{o.room.name.charAt(0)}</span>
                      </div>
                    )}
                    <span className="absolute left-3 top-3 bg-[var(--brand)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      {t(ASSET_TYPE_SHORT[o.room.assetType])}
                    </span>
                    {!o.available && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <span className="bg-white/90 px-3 py-1 text-xs font-semibold text-neutral-700">
                          {t("No disponible")}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold">
                      {t("Habitación {name}", { name: o.room.name })}
                    </h3>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
                      <Users className="h-3 w-3" /> {t("Hasta")} {o.room.capacity}{" "}
                      {t(o.room.capacity === 1 ? "persona" : "personas")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {o.room.features.slice(0, 4).map((fe) => (
                        <span
                          key={fe}
                          className="bg-[var(--brand-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--brand)]"
                        >
                          {t(FEATURE_LABELS[fe])}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div>
                        {o.available ? (
                          <div>
                            <p className="text-base font-semibold leading-tight">
                              {eur0(o.pricePerNight)}
                              <span className="text-xs font-normal text-neutral-400">
                                /{t("noche")}
                              </span>
                            </p>
                            <p className="text-[11px] text-neutral-500">
                              {eur0(o.price)} · {o.nights} {t(o.nights === 1 ? "noche" : "noches")}
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm font-medium text-amber-600">{t("No disponible")}</p>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1  bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white">
                        {t("Ver")} <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
              {filteredOffers.length === 0 && (
                <p className="col-span-2 py-8 text-center text-sm text-neutral-400">
                  {t("No hay habitaciones para los filtros seleccionados.")}
                </p>
              )}
            </div>
          </div>

          {/* Offers: date sales and published promo codes (replaces the experiences) */}
          <HotelOffers
            tenantId={tenantId}
            propertyId={hotelId}
            guests={guests}
            activePromo={promo}
            onPickPromo={setPromo}
            onPickDates={(ci, co) => {
              setCheckIn(ci);
              setCheckOut(co);
              document.getElementById("rooms")?.scrollIntoView({ behavior: "smooth" });
            }}
          />
        </div>

        <HotelReviews propertyId={hotelId} hotelName={hotel?.name} />
      </div>
    </div>
  );
}

function HotelReviews({ propertyId, hotelName }: { propertyId: string; hotelName?: string }) {
  const features = useFeatures();
  const [limit, setLimit] = useState(6);
  const { t } = useLang();
  const { data } = useReviews({ property: propertyId }, limit);
  if (!features.reviews || !data) return null;
  return (
    <section className="mt-12">
      <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
        <Star className="h-5 w-5 text-[var(--brand)]" /> {t("Opiniones de huéspedes")}
      </h2>
      <div className="mt-4 bg-white p-5 shadow-sm ring-1 ring-neutral-100">
        <ReviewSummary page={data} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {data.reviews.map((r) => (
          <ReviewCard key={r.id} review={r} hotelName={hotelName} />
        ))}
      </div>
      {data.count > data.reviews.length && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + 12)}
          className="mt-4 text-sm font-medium text-[var(--brand)] underline-offset-4 hover:underline"
        >
          {t("Ver más opiniones")}
        </button>
      )}
    </section>
  );
}
