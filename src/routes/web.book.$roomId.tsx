import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Users, Clock, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { pms } from "@/integrations/pms";
import { IS_DEMO } from "@/integrations/supabase/client";
import { eur, formatDateLong } from "@/lib/stays";

interface WebBookSearch {
  checkIn: string;
  checkOut: string;
  guests: number;
}

export const Route = createFileRoute("/web/book/$roomId")({
  component: WebBookScreen,
  validateSearch: (s: Record<string, unknown>): WebBookSearch => ({
    checkIn: String(s.checkIn ?? ""),
    checkOut: String(s.checkOut ?? ""),
    guests: Number(s.guests ?? 1),
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

function WebBookScreen() {
  const { roomId } = Route.useParams();
  const { checkIn, checkOut, guests } = Route.useSearch();
  const navigate = useNavigate();
  // Guest details (no account needed). Prefilled in the backend-free demo.
  const [guest, setGuest] = useState(
    IS_DEMO
      ? { name: "Alex Río", email: "alex@guest.demostays.example", phone: "+34 600 123 456" }
      : { name: "", email: "", phone: "" },
  );
  const guestValid = guest.name.trim().length >= 2 && /^\S+@\S+\.\S+$/.test(guest.email.trim());

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
    enabled: !!propertyId,
    queryFn: async () => {
      const offers = await pms.searchAvailability({
        propertyId: propertyId!,
        checkIn,
        checkOut,
        guests,
      });
      return offers.find((o) => o.room.id === roomId) ?? null;
    },
  });

  const create = useMutation({
    mutationFn: async (hold: boolean) => {
      if (!room || !propertyId) throw new Error("Habitación no disponible");
      const prebooking = await pms.createPrebooking({
        guest: {
          name: guest.name.trim(),
          email: guest.email.trim(),
          ...(guest.phone.trim() ? { phone: guest.phone.trim() } : {}),
        },
        propertyId,
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
        navigate({ to: "/web/checkout/$bookingId", params: { bookingId: prebooking.id } });
      } else {
        navigate({
          to: "/web/checkout/$bookingId",
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
    <div className="mx-auto max-w-2xl px-5 py-10">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => history.back()}
          className="flex h-10 w-10 items-center justify-center  border border-neutral-200 bg-white text-neutral-700"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-2xl font-bold">Confirma tu reserva</h1>
      </div>

      <div className="overflow-hidden  bg-white shadow-sm ring-1 ring-neutral-100">
        {room?.imageUrl && (
          <img src={room.imageUrl} alt={room.name} className="h-52 w-full object-cover" />
        )}
        <div className="space-y-3 p-6">
          <h2 className="text-xl font-semibold">Habitación {room?.name ?? ""}</h2>
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

      <div className="mt-5 space-y-3 bg-white p-6 shadow-sm ring-1 ring-neutral-100">
        <h3 className="font-semibold">Datos del huésped</h3>
        <Field label="Nombre y apellidos">
          <input
            value={guest.name}
            onChange={(e) => setGuest({ ...guest, name: e.target.value })}
            autoComplete="name"
            className="w-full border border-neutral-200 px-3 py-2.5 text-sm"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email">
            <input
              type="email"
              value={guest.email}
              onChange={(e) => setGuest({ ...guest, email: e.target.value })}
              autoComplete="email"
              className="w-full border border-neutral-200 px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label="Teléfono (opcional)">
            <input
              type="tel"
              value={guest.phone}
              onChange={(e) => setGuest({ ...guest, phone: e.target.value })}
              autoComplete="tel"
              className="w-full border border-neutral-200 px-3 py-2.5 text-sm"
            />
          </Field>
        </div>
        <p className="text-xs text-neutral-400">
          Te enviaremos la confirmación y el enlace para gestionar la reserva.
        </p>
      </div>

      <div className="mt-5  bg-white p-6 shadow-sm ring-1 ring-neutral-100">
        <div className="flex items-center justify-between text-sm text-neutral-600">
          <span>Total estancia</span>
          <span className="text-xl font-semibold text-neutral-900">{eur(total)}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-sm text-neutral-500">
          <span>Señal online (30%)</span>
          <span className="font-medium">{eur(deposit)}</span>
        </div>
        <p className="mt-1 text-xs text-neutral-400">
          Importe calculado para tus fechas; el total definitivo lo confirma el hotel al reservar.
          El resto se abona al llegar.
        </p>
      </div>

      <div className="mt-6 space-y-3">
        <button
          disabled={create.isPending || !offer?.available || !guestValid}
          onClick={() => create.mutate(false)}
          className="flex w-full items-center justify-center gap-2  bg-[var(--brand)] py-4 font-semibold text-white disabled:opacity-50"
        >
          <ShieldCheck className="h-5 w-5" /> Reservar y pagar señal
        </button>
        <button
          disabled={create.isPending || !offer?.available || !guestValid}
          onClick={() => create.mutate(true)}
          className="flex w-full items-center justify-center gap-2  border border-[var(--brand)]/40 bg-white py-4 font-semibold text-[var(--brand)] disabled:opacity-50"
        >
          <Sparkles className="h-5 w-5" /> Prereservar (mantener 30 min)
        </button>
        <p className="text-center text-xs text-neutral-400">
          La prereserva bloquea la habitación sin pagar; confírmala antes de que expire.
        </p>
      </div>

      <Link to="/web" className="mt-6 block text-center text-xs text-neutral-400 underline">
        Cancelar y volver al inicio
      </Link>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
        {label}
      </span>
      {children}
    </label>
  );
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
