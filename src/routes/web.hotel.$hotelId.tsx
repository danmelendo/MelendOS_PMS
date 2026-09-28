import { ReviewCard, ReviewSummary } from "@/components/Reviews";
import { useReviews } from "@/lib/reviews";
import { useFeatures } from "@/lib/features";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Star, Users, ArrowRight, Sparkles, CalendarDays } from "lucide-react";
import { pms } from "@/integrations/pms";
import { cms } from "@/integrations/cms";
import {
  accentGradient,
  dateOffset,
  AMENITY_LABELS,
  ASSET_TYPE_LABELS,
  ASSET_TYPE_SHORT,
  FEATURE_LABELS,
  EVENT_CATEGORY_LABELS,
  eur0,
} from "@/lib/stays";
import { HotelCoverArt } from "@/components/cover-art";
import { DateRangePicker } from "@/components/DateRangePicker";
import type { AssetType } from "@/integrations/pms";

const isYmd = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const Route = createFileRoute("/web/hotel/$hotelId")({
  component: WebHotelDetail,
  // Dates and guests can come in the link (the embedded search widget).
  validateSearch: (
    s: Record<string, unknown>,
  ): { checkIn?: string; checkOut?: string; guests?: number } => ({
    checkIn: isYmd(s.checkIn) ? s.checkIn : undefined,
    checkOut: isYmd(s.checkOut) ? s.checkOut : undefined,
    guests: Number(s.guests) >= 1 && Number(s.guests) <= 12 ? Number(s.guests) : undefined,
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

  const { data: hotel } = useQuery({
    queryKey: ["pms", "property", hotelId],
    queryFn: () => pms.getProperty(hotelId),
  });
  const { data: offers } = useQuery({
    queryKey: ["pms", "availability", hotelId, checkIn, checkOut, guests],
    queryFn: () => pms.searchAvailability({ propertyId: hotelId, checkIn, checkOut, guests }),
  });
  const { data: events } = useQuery({
    queryKey: ["cms", "events", hotelId],
    queryFn: () => cms.listEvents({ hotelId, upcomingOnly: true }),
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
                  {AMENITY_LABELS[a] ?? a}
                </span>
              ))}
            </div>
          </>
        )}

        {/* ── Date + filter bar ── */}
        <div className="mt-8 flex flex-wrap items-end gap-4  bg-white p-4 shadow-sm ring-1 ring-neutral-100">
          <div className="w-full sm:w-72">
            <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              <CalendarDays className="h-3 w-3" /> Fechas
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
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-3">
          {/* Assets */}
          <div className="lg:col-span-2">
            <h2 className="text-xl font-bold tracking-tight">Habitaciones</h2>
            <p className="text-sm text-neutral-500">
              {assetType
                ? ASSET_TYPE_LABELS[assetType]
                : "Precio total para tus fechas, impuestos incluidos."}
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {filteredOffers.map((o) => (
                <Link
                  key={o.room.id}
                  to="/web/room/$roomId"
                  params={{ roomId: o.room.id }}
                  search={{ hotelId, checkIn, checkOut }}
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
                      {ASSET_TYPE_SHORT[o.room.assetType]}
                    </span>
                    {!o.available && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <span className="bg-white/90 px-3 py-1 text-xs font-semibold text-neutral-700">
                          No disponible
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold">Habitación {o.room.name}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
                      <Users className="h-3 w-3" /> Hasta {o.room.capacity}{" "}
                      {o.room.capacity === 1 ? "persona" : "personas"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {o.room.features.slice(0, 4).map((fe) => (
                        <span
                          key={fe}
                          className="bg-[var(--brand-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--brand)]"
                        >
                          {FEATURE_LABELS[fe]}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div>
                        {o.available ? (
                          <div>
                            <p className="text-base font-semibold leading-tight">
                              {eur0(o.pricePerNight)}
                              <span className="text-xs font-normal text-neutral-400">/noche</span>
                            </p>
                            <p className="text-[11px] text-neutral-500">
                              {eur0(o.price)} · {o.nights} {o.nights === 1 ? "noche" : "noches"}
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm font-medium text-amber-600">No disponible</p>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1  bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white">
                        Ver <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
              {filteredOffers.length === 0 && (
                <p className="col-span-2 py-8 text-center text-sm text-neutral-400">
                  No hay habitaciones para los filtros seleccionados.
                </p>
              )}
            </div>
          </div>

          {/* Hotel experiences */}
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <Sparkles className="h-5 w-5 text-[var(--brand)]" /> Experiencias
            </h2>
            <p className="text-sm text-neutral-500">Agenda servida por {cms.cmsName}.</p>
            <div className="mt-5 space-y-3">
              {(events ?? []).map((e) => (
                <Link
                  key={e.id}
                  to="/web/event/$eventId"
                  params={{ eventId: e.id }}
                  className=" block bg-white p-4 shadow-sm ring-1 ring-neutral-100 transition hover:shadow-md"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--brand)]">
                    {EVENT_CATEGORY_LABELS[e.category]}
                  </span>
                  <h3 className="mt-0.5 font-semibold leading-tight">{e.title}</h3>
                  <p className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {new Date(e.startsAt).toLocaleString("es-ES", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">
                    {e.attending}/{e.capacity} plazas ocupadas
                  </p>
                </Link>
              ))}
              {events && events.length === 0 && (
                <p className="text-sm text-neutral-400">Sin experiencias próximas.</p>
              )}
              <Link
                to="/web/events"
                className="inline-flex items-center gap-1 text-sm font-medium text-[var(--brand)]"
              >
                Ver toda la agenda <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>

        <HotelReviews propertyId={hotelId} hotelName={hotel?.name} />
      </div>
    </div>
  );
}

function HotelReviews({ propertyId, hotelName }: { propertyId: string; hotelName?: string }) {
  const features = useFeatures();
  const [limit, setLimit] = useState(6);
  const { data } = useReviews({ property: propertyId }, limit);
  if (!features.reviews || !data) return null;
  return (
    <section className="mt-12">
      <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
        <Star className="h-5 w-5 text-[var(--brand)]" /> Opiniones de huéspedes
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
          Ver más opiniones
        </button>
      )}
    </section>
  );
}
