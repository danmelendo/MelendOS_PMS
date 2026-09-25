import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Users, MapPin, Check } from "lucide-react";
import { pms } from "@/integrations/pms";
import { accentGradient, ASSET_TYPE_LABELS, FEATURE_LABELS, dateOffset, eur0 } from "@/lib/stays";
import { DateRangePicker } from "@/components/DateRangePicker";

interface RoomSearch {
  hotelId?: string;
  checkIn?: string;
  checkOut?: string;
}

export const Route = createFileRoute("/web/room/$roomId")({
  component: WebRoomDetail,
  validateSearch: (s: Record<string, unknown>): RoomSearch => ({
    hotelId: s.hotelId ? String(s.hotelId) : undefined,
    checkIn: s.checkIn ? String(s.checkIn) : undefined,
    checkOut: s.checkOut ? String(s.checkOut) : undefined,
  }),
});

async function findPropertyForRoom(roomId: string): Promise<string | null> {
  const properties = await pms.listProperties();
  for (const p of properties) {
    const rooms = await pms.listRooms(p.id);
    if (rooms.some((r) => r.id === roomId)) return p.id;
  }
  return null;
}

function WebRoomDetail() {
  const { roomId } = Route.useParams();
  const { hotelId, checkIn: initCheckIn, checkOut: initCheckOut } = Route.useSearch();
  const navigate = useNavigate();

  const [checkIn, setCheckIn] = useState(initCheckIn ?? dateOffset(7));
  const [checkOut, setCheckOut] = useState(initCheckOut ?? dateOffset(10));

  const { data: propertyId } = useQuery({
    queryKey: ["pms", "room-property", roomId],
    queryFn: () => findPropertyForRoom(roomId),
  });

  const { data: room } = useQuery({
    queryKey: ["pms", "room", roomId, propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const rooms = await pms.listRooms(propertyId!);
      return rooms.find((r) => r.id === roomId) ?? null;
    },
  });

  const { data: offer } = useQuery({
    queryKey: ["pms", "availability-room", propertyId, roomId, checkIn, checkOut],
    enabled: !!propertyId && checkIn < checkOut,
    queryFn: async () => {
      const offers = await pms.searchAvailability({
        propertyId: propertyId!,
        checkIn,
        checkOut,
        guests: 1,
      });
      return offers.find((o) => o.room.id === roomId) ?? null;
    },
  });

  const { data: property } = useQuery({
    queryKey: ["pms", "property", propertyId],
    enabled: !!propertyId,
    queryFn: () => pms.getProperty(propertyId!),
  });

  const backHref = hotelId ? `/web/hotel/${hotelId}` : "/web/hotels";

  return (
    <div>
      {/* Hero */}
      <div
        className="relative h-72 overflow-hidden"
        style={{ background: property ? accentGradient(property.accent) : "#cbd5e1" }}
      >
        {room?.imageUrl ? (
          <img src={room.imageUrl} alt={room.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-7xl font-bold text-white/30">{room?.name?.charAt(0) ?? "?"}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <a
          href={backHref}
          className="absolute left-5 top-5 flex h-9 w-9 items-center justify-center  bg-white/90 text-neutral-800"
        >
          <ArrowLeft className="h-4 w-4" />
        </a>
        {room && (
          <div className="absolute bottom-6 left-0 right-0">
            <div className="mx-auto max-w-4xl px-5 text-white">
              <span className="inline-block bg-[var(--brand)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
                {room.assetType ? ASSET_TYPE_LABELS[room.assetType] : "Habitación"}
              </span>
              <h1 className="mt-2 text-3xl font-bold">Habitación {room.name}</h1>
              {property && (
                <p className="mt-1 flex items-center gap-1 text-sm opacity-90">
                  <MapPin className="h-4 w-4" /> {property.name} · {property.city}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-4xl px-5 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left: room info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Features */}
            {room && (
              <div>
                <h2 className="text-lg font-bold tracking-tight">Características</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {room.features.map((f) => (
                    <span
                      key={f}
                      className="flex items-center gap-1.5  bg-[var(--brand-soft)] px-3 py-1.5 text-sm font-medium text-[var(--brand)]"
                    >
                      <Check className="h-3.5 w-3.5" /> {FEATURE_LABELS[f]}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Capacity */}
            {room && (
              <div className="flex items-center gap-3  bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                <Users className="h-5 w-5 text-[var(--brand)]" />
                <span>
                  Hasta{" "}
                  <strong>
                    {room.capacity} {room.capacity === 1 ? "persona" : "personas"}
                  </strong>
                </span>
              </div>
            )}

            {/* Property info */}
            {property && (
              <div>
                <h2 className="text-lg font-bold tracking-tight">Sobre el hotel</h2>
                <p className="mt-2 text-sm text-neutral-600">{property.description}</p>
                <Link
                  to="/web/hotel/$hotelId"
                  params={{ hotelId: property.id }}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--brand)]"
                >
                  Ver más sobre {property.name} <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
                </Link>
              </div>
            )}
          </div>

          {/* Right: booking form */}
          <div>
            <div className=" bg-white p-6 shadow-md ring-1 ring-neutral-200 sticky top-20">
              {offer && (
                <div>
                  <p className="text-2xl font-semibold leading-tight">
                    {eur0(offer.pricePerNight)}
                    <span className="text-sm font-normal text-neutral-400">/noche</span>
                  </p>
                  <p className="text-xs text-neutral-500">
                    Total {eur0(offer.price)} · {offer.nights}{" "}
                    {offer.nights === 1 ? "noche" : "noches"}
                  </p>
                </div>
              )}
              <div className="mt-4">
                <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  <CalendarDays className="h-3 w-3" /> Fechas
                </span>
                <DateRangePicker
                  checkIn={checkIn}
                  checkOut={checkOut}
                  onChange={({ checkIn: ci, checkOut: co }) => {
                    setCheckIn(ci);
                    setCheckOut(co);
                  }}
                />
              </div>

              {checkIn >= checkOut && (
                <p className="mt-2 text-xs text-rose-600">
                  La salida debe ser posterior a la entrada.
                </p>
              )}

              {offer && !offer.available && (
                <p className="mt-3  bg-amber-50 px-3 py-2 text-center text-sm font-medium text-amber-700">
                  No disponible para estas fechas
                </p>
              )}

              <button
                disabled={!offer?.available || checkIn >= checkOut}
                onClick={() =>
                  navigate({
                    to: "/web/book/$roomId",
                    params: { roomId },
                    search: { checkIn, checkOut, guests: Math.min(2, room?.capacity ?? 2) },
                  })
                }
                className="mt-4 w-full  bg-[var(--brand)] py-3 font-semibold text-white disabled:opacity-40"
              >
                Reservar
              </button>
              <p className="mt-2 text-center text-xs text-neutral-400">
                Señal del 30 % online · resto en el hotel
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
