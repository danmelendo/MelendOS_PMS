import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Users, Clock, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { pms } from "@/integrations/pms";
import { useMember } from "@/lib/member-session";
import { eur, formatDateLong } from "@/lib/stays";

interface BookSearch {
  checkIn: string;
  checkOut: string;
  guests: number;
}

export const Route = createFileRoute("/stays/book/$roomId")({
  component: BookScreen,
  validateSearch: (s: Record<string, unknown>): BookSearch => ({
    checkIn: String(s.checkIn ?? ""),
    checkOut: String(s.checkOut ?? ""),
    guests: Number(s.guests ?? 2),
  }),
});

function BookScreen() {
  const { roomId } = Route.useParams();
  const { checkIn, checkOut, guests } = Route.useSearch();
  const { memberId } = useMember();
  const navigate = useNavigate();

  // We need the room's property + a fresh quote; reuse availability for one room.
  const { data: room } = useQuery({
    queryKey: ["pms", "book-room", roomId],
    queryFn: async () => {
      const rooms = await pms.listRooms((await findPropertyForRoom(roomId)) ?? "");
      return rooms.find((r) => r.id === roomId) ?? null;
    },
  });
  const { data: offer } = useQuery({
    queryKey: ["pms", "book-offer", roomId, checkIn, checkOut, guests],
    enabled: !!room,
    queryFn: async () => {
      const offers = await pms.searchAvailability({
        propertyId: room!.propertyId,
        checkIn,
        checkOut,
        guests,
      });
      return offers.find((o) => o.room.id === roomId) ?? null;
    },
  });

  const create = useMutation({
    mutationFn: async (hold: boolean) => {
      if (!room) throw new Error("Habitación no disponible");
      const prebooking = await pms.createPrebooking({
        memberId,
        propertyId: room.propertyId,
        roomId,
        checkIn,
        checkOut,
        guests,
        hold,
      });
      return { prebooking, hold };
    },
    onSuccess: ({ prebooking, hold }) => {
      if (hold) {
        toast.success("Prereserva creada · tienes 30 min para confirmar");
        navigate({ to: "/stays/checkout/$bookingId", params: { bookingId: prebooking.id } });
      } else {
        navigate({
          to: "/stays/checkout/$bookingId",
          params: { bookingId: prebooking.id },
          search: { auto: true },
        });
      }
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo crear la reserva"),
  });

  const nights = offer?.nights ?? 0;
  const total = offer?.price ?? 0;
  const deposit = Math.round(total * 0.3 * 100) / 100;

  return (
    <div className="px-5 pt-6">
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => history.back()}
          className="flex h-9 w-9 items-center justify-center  bg-white ring-1 ring-neutral-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-lg font-semibold">Tu reserva</h1>
      </div>

      <div className="overflow-hidden  bg-white shadow-sm ring-1 ring-neutral-100">
        {room?.imageUrl && (
          <img src={room.imageUrl} alt={room.name} className="h-40 w-full object-cover" />
        )}
        <div className="space-y-3 p-4">
          <h2 className="text-xl font-semibold">{room?.name ?? "Habitación"}</h2>
          <Row icon={CalendarDays} label="Entrada">
            {formatDateLong(`${checkIn}T15:00:00`)} · 15:00
          </Row>
          <Row icon={CalendarDays} label="Salida">
            {formatDateLong(`${checkOut}T12:00:00`)} · 12:00
          </Row>
          <Row icon={Clock} label="Noches">
            {nights}
          </Row>
          <Row icon={Users} label="Huéspedes">
            {guests}
          </Row>
        </div>
      </div>

      <div className="mt-4  bg-white p-4 shadow-sm ring-1 ring-neutral-100">
        <div className="flex items-center justify-between text-sm text-neutral-600">
          <span>Total estancia</span>
          <span className="text-lg font-semibold text-neutral-900">{eur(total)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm text-neutral-500">
          <span>Señal online (30%)</span>
          <span className="font-medium">{eur(deposit)}</span>
        </div>
        <p className="mt-1 text-xs text-neutral-400">
          El resto se abona en la propiedad al llegar.
        </p>
      </div>

      {/* CTAs */}
      <div className="mt-5 space-y-3">
        <button
          disabled={create.isPending || !offer?.available}
          onClick={() => create.mutate(false)}
          className="flex w-full items-center justify-center gap-2  bg-[var(--brand)] py-3.5 font-semibold text-white disabled:opacity-50"
        >
          <ShieldCheck className="h-5 w-5" /> Reservar y pagar señal
        </button>
        <button
          disabled={create.isPending || !offer?.available}
          onClick={() => create.mutate(true)}
          className="flex w-full items-center justify-center gap-2  bg-white py-3.5 font-semibold text-[var(--brand)] ring-1 ring-[var(--brand)]/30 disabled:opacity-50"
        >
          <Sparkles className="h-5 w-5" /> Prereservar (mantener 30 min)
        </button>
        <p className="text-center text-xs text-neutral-400">
          La prereserva bloquea la habitación sin pagar; confírmala antes de que expire.
        </p>
      </div>

      <Link
        to="/stays/loyalty"
        className="mt-4 block text-center text-xs text-neutral-400 underline"
      >
        Ganarás puntos del Club al confirmar
      </Link>
    </div>
  );
}

// Resolve which property a room belongs to (the connector lists rooms per
// property; for a single room we scan properties — fine at demo scale).
async function findPropertyForRoom(roomId: string): Promise<string | null> {
  const properties = await pms.listProperties();
  for (const p of properties) {
    const rooms = await pms.listRooms(p.id);
    if (rooms.some((r) => r.id === roomId)) return p.id;
  }
  return null;
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-neutral-500">
        <Icon className="h-4 w-4" /> {label}
      </span>
      <span className="font-medium text-neutral-800">{children}</span>
    </div>
  );
}
