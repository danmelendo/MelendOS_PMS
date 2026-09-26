import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  MapPin,
  Star,
  Users,
  Check,
  Bell,
  BellRing,
  Sparkles,
  ChevronRight,
  TrendingUp,
  DoorOpen,
} from "lucide-react";
import { toast } from "sonner";
import { pms } from "@/integrations/pms";
import { cms } from "@/integrations/cms";
import { useMember } from "@/lib/member-session";
import { requestNotificationPermission } from "@/lib/notifications";
import {
  accentGradient,
  AMENITY_LABELS,
  ASSET_TYPE_SHORT,
  ASSET_TYPE_LABELS,
  FEATURE_LABELS,
  dateOffset,
  eur0,
  eur,
  OCCUPANCY_LABELS,
  OCCUPANCY_CLASSES,
} from "@/lib/stays";
import { DateRangePicker } from "@/components/DateRangePicker";
import { HotelCoverArt } from "@/components/cover-art";
import { EventCard } from "./stays.experiences";
import type { AssetType, RoomOffer } from "@/integrations/pms";

export const Route = createFileRoute("/stays/property/$propertyId")({
  component: PropertyScreen,
});

const ASSET_FILTERS: { label: string; value: AssetType | null }[] = [
  { label: "Todas", value: null },
  { label: "Habitaciones", value: "room" },
  { label: "Suites", value: "suite" },
  { label: "Familiares", value: "family" },
];

function PropertyScreen() {
  const { propertyId } = Route.useParams();
  const navigate = useNavigate();
  const { memberId } = useMember();
  const qc = useQueryClient();

  const [checkIn, setCheckIn] = useState(dateOffset(7));
  const [checkOut, setCheckOut] = useState(dateOffset(8));
  const [guests, setGuests] = useState(1);
  const [assetType, setAssetType] = useState<AssetType | null>(null);

  const { data: property } = useQuery({
    queryKey: ["pms", "property", propertyId],
    queryFn: () => pms.getProperty(propertyId),
  });
  const { data: offers, isFetching } = useQuery({
    queryKey: ["pms", "availability", propertyId, checkIn, checkOut, guests],
    queryFn: () => pms.searchAvailability({ propertyId, checkIn, checkOut, guests }),
    enabled: checkIn < checkOut,
  });
  const { data: watches } = useQuery({
    queryKey: ["pms", "watches", memberId],
    queryFn: () => pms.listWatches(memberId),
  });
  const { data: events } = useQuery({
    queryKey: ["cms", "events", propertyId],
    queryFn: () => cms.listEvents({ hotelId: propertyId, upcomingOnly: true }),
  });
  const watchedRooms = new Set(
    (watches ?? [])
      .filter((w) => w.status === "watching" && w.checkIn === checkIn && w.checkOut === checkOut)
      .map((w) => w.roomId),
  );

  const watch = useMutation({
    mutationFn: async (roomId: string) => {
      const perm = await requestNotificationPermission();
      await pms.createWatch({ memberId, propertyId, roomId, checkIn, checkOut, guests });
      return perm;
    },
    onSuccess: (perm) => {
      qc.invalidateQueries({ queryKey: ["pms", "watches", memberId] });
      toast.success("Te avisaremos cuando se libere", {
        description:
          perm === "granted"
            ? "Recibirás una notificación en cuanto esté disponible."
            : "Activa las notificaciones para recibir el aviso en el móvil.",
      });
    },
    onError: () => toast.error("No se pudo crear el aviso"),
  });

  const filteredOffers: RoomOffer[] = (offers ?? []).filter(
    (o) => assetType === null || o.room.assetType === assetType,
  );

  return (
    <div>
      {/* Hero */}
      <div
        className="relative h-52 overflow-hidden"
        style={{ background: property ? accentGradient(property.accent) : "#ddd" }}
      >
        <HotelCoverArt />
        <div className="absolute inset-0 bg-black/15" />
        <Link
          to="/stays"
          className="absolute left-4 top-5 flex h-9 w-9 items-center justify-center  bg-white/90 text-neutral-800"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        {property && (
          <div className="absolute bottom-4 left-5 right-5 text-white">
            <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider opacity-90">
              <MapPin className="h-3 w-3" /> {property.provinceName} · {property.city}
            </p>
            <h1 className="text-2xl font-semibold drop-shadow-sm">{property.name}</h1>
            <p className="mt-0.5 flex items-center gap-1 text-sm">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{" "}
              {property.rating.toFixed(1)} · {property.address}
            </p>
          </div>
        )}
      </div>

      {/* Search form */}
      <div className="mx-5 mt-4  bg-white p-4 shadow-sm ring-1 ring-neutral-100">
        <Field label="Fechas">
          <DateRangePicker
            checkIn={checkIn}
            checkOut={checkOut}
            pricing={{ propertyId, guests }}
            onChange={({ checkIn: ci, checkOut: co }) => {
              setCheckIn(ci);
              setCheckOut(co);
            }}
          />
        </Field>
        <div className="mt-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm text-neutral-600">
            <Users className="h-4 w-4" /> Habitaciones
          </span>
          <div className="flex items-center gap-3">
            <Stepper onClick={() => setGuests((g) => Math.max(1, g - 1))} label="−" />
            <span className="w-5 text-center text-sm font-semibold">{guests}</span>
            <Stepper onClick={() => setGuests((g) => Math.min(6, g + 1))} label="+" />
          </div>
        </div>
      </div>

      {/* Price preview — concrete "for your dates" price, occupancy-aware */}
      {checkIn < checkOut && (
        <PricePreviewCard
          propertyId={propertyId}
          checkIn={checkIn}
          checkOut={checkOut}
          guests={guests}
        />
      )}

      {/* Asset type filter */}
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
        {ASSET_FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setAssetType(f.value)}
            className={`shrink-0  px-3 py-1.5 text-xs font-medium transition ${
              assetType === f.value
                ? "bg-[var(--brand)] text-white"
                : "bg-white text-neutral-600 ring-1 ring-neutral-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {property && (
        <div className="px-5 py-4">
          <p className="text-sm leading-relaxed text-neutral-600">{property.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {property.amenities.map((a) => (
              <span
                key={a}
                className=" bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600"
              >
                {AMENITY_LABELS[a] ?? a}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Experiences teaser */}
      {events && events.length > 0 && (
        <div className="px-5 pb-1">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              <Sparkles className="h-4 w-4" /> Experiencias
            </h2>
            <Link
              to="/stays/experiences"
              className="flex items-center text-xs font-medium text-[var(--brand)]"
            >
              Ver todos <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="space-y-3">
            {events.slice(0, 2).map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </div>
      )}

      {/* Offers */}
      <div className="space-y-3 px-5 pb-6 pt-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
          {assetType ? ASSET_TYPE_LABELS[assetType] : "Habitaciones"} {isFetching && "·"}
        </h2>
        {checkIn >= checkOut && (
          <p className="text-sm text-rose-600">La salida debe ser posterior a la entrada.</p>
        )}
        {filteredOffers.length === 0 && !isFetching && (offers ?? []).length > 0 && (
          <p className="text-sm text-neutral-500">
            Sin resultados para este filtro. Prueba con "Todas".
          </p>
        )}
        {filteredOffers.map((offer) => (
          <div
            key={offer.room.id}
            className={`overflow-hidden  bg-white shadow-sm ring-1 ring-neutral-100 ${
              !offer.available ? "opacity-60" : ""
            }`}
          >
            <div className="flex">
              <div className="h-auto w-28 shrink-0 bg-neutral-100">
                {offer.room.imageUrl && (
                  <img
                    src={offer.room.imageUrl}
                    alt={offer.room.name}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="flex flex-1 flex-col justify-between p-3">
                <div>
                  <span className="mb-1 inline-block  bg-[var(--brand-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand)]">
                    {ASSET_TYPE_SHORT[offer.room.assetType]}
                  </span>
                  <h3 className="font-semibold text-neutral-900">Habitación {offer.room.name}</h3>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
                    <Users className="h-3 w-3" /> Hasta {offer.room.capacity}{" "}
                    {offer.room.capacity === 1 ? "persona" : "personas"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {offer.room.features.slice(0, 3).map((f) => (
                      <span
                        key={f}
                        className="bg-[var(--brand-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--brand)]"
                      >
                        {FEATURE_LABELS[f]}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <div>
                    <p className="text-base font-semibold leading-tight text-neutral-900">
                      {eur0(offer.pricePerNight)}
                      <span className="text-xs font-normal text-neutral-400">/noche</span>
                    </p>
                    <p className="text-[11px] text-neutral-500">Total {eur0(offer.price)}</p>
                  </div>
                  {offer.available ? (
                    <button
                      onClick={() =>
                        navigate({
                          to: "/stays/book/$roomId",
                          params: { roomId: offer.room.id },
                          search: { checkIn, checkOut, guests },
                        })
                      }
                      className=" bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white active:scale-95"
                    >
                      Reservar
                    </button>
                  ) : watchedRooms.has(offer.room.id) ? (
                    <span className="flex items-center gap-1.5  bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-700">
                      <BellRing className="h-3.5 w-3.5" /> Avisándote
                    </span>
                  ) : (
                    <button
                      onClick={() => watch.mutate(offer.room.id)}
                      disabled={watch.isPending}
                      className="flex items-center gap-1.5  border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 active:scale-95 disabled:opacity-50"
                    >
                      <Bell className="h-3.5 w-3.5" /> Avísame
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        {offers &&
          offers.length > 0 &&
          filteredOffers.every((o) => !o.available) &&
          filteredOffers.length > 0 && (
            <p className="flex items-center gap-2  bg-amber-50 px-3 py-2 text-sm text-amber-700">
              <Check className="h-4 w-4" /> Sin disponibilidad para esas fechas. Prueba otras.
            </p>
          )}
      </div>
    </div>
  );
}

// Occupancy-aware price preview: resolves the catalogue's indeterminate range
// into a concrete "for your dates" figure for the cheapest available asset.
function PricePreviewCard({
  propertyId,
  checkIn,
  checkOut,
  guests,
}: {
  propertyId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}) {
  const { data: preview, isFetching } = useQuery({
    queryKey: ["pms", "preview", propertyId, checkIn, checkOut, guests],
    queryFn: () => pms.getPricePreview({ propertyId, checkIn, checkOut, guests }),
  });

  return (
    <div className="mx-5 mt-3 overflow-hidden rounded-xl bg-[var(--brand)]/[0.06] p-4 ring-1 ring-[var(--brand)]/15">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Para tus fechas {isFetching && "·"}
        </p>
        {preview && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${OCCUPANCY_CLASSES[preview.band]}`}
          >
            <TrendingUp className="h-3 w-3" /> {OCCUPANCY_LABELS[preview.band]}
          </span>
        )}
      </div>

      {preview?.fromNight != null ? (
        <>
          <div className="mt-2 flex items-end justify-between">
            <div>
              <p className="text-[11px] text-neutral-400">desde</p>
              <p className="text-xl font-bold leading-tight text-neutral-900">
                {eur0(preview.fromNight)}
                <span className="text-sm font-normal text-neutral-400">/noche</span>
              </p>
            </div>
            {preview.nights > 0 && preview.fromTotal != null && (
              <div className="text-right">
                <p className="text-[11px] text-neutral-400">{preview.nights} noches</p>
                <p className="text-base font-semibold text-neutral-900">{eur(preview.fromTotal)}</p>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
            <span className="inline-flex items-center gap-1">
              <DoorOpen className="h-3.5 w-3.5" /> {preview.available} de {preview.totalRooms}{" "}
              libres
            </span>
            {preview.surchargePct > 0 && (
              <span className="font-medium text-amber-600">
                Precio ajustado por ocupación (+{preview.surchargePct}%)
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-neutral-500">
          {isFetching ? "Calculando precio…" : "Sin disponibilidad para esas fechas. Prueba otras."}
        </p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function Stepper({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center  border border-neutral-300 text-neutral-700 active:bg-neutral-100"
    >
      {label}
    </button>
  );
}
