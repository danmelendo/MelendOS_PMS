import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  Users,
  X,
  Clock,
  MapPin,
  Check,
  Dumbbell,
  Sun,
  Sparkles,
  Presentation,
  Waves,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { pms } from "@/integrations/pms";
import { useMember } from "@/lib/member-session";
import { SPACE_KIND_LABELS, formatHour, formatDateShort, dateOffset, eur } from "@/lib/stays";
import type { CommonSpace, CommonSpaceKind } from "@/integrations/pms";

export const Route = createFileRoute("/stays/spaces")({
  component: SpacesScreen,
});

const KIND_ICON: Record<CommonSpaceKind, React.ComponentType<{ className?: string }>> = {
  spa: Sparkles,
  gym: Dumbbell,
  padel: Trophy,
  meeting: Presentation,
  rooftop: Sun,
  pool: Waves,
};

function SpacesScreen() {
  const { memberId } = useMember();
  const [selected, setSelected] = useState<CommonSpace | null>(null);

  const { data: spaces, isLoading } = useQuery({
    queryKey: ["pms", "spaces"],
    queryFn: () => pms.listCommonSpaces(),
  });
  const { data: bookings } = useQuery({
    queryKey: ["pms", "space-bookings", memberId],
    queryFn: () => pms.listSpaceBookings(memberId),
  });

  const myBookings = (bookings ?? []).filter((b) => b.status === "confirmed");

  return (
    <div className="px-5 pt-6">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Building2 className="h-6 w-6 text-[var(--brand)]" /> Instalaciones
      </h1>
      <p className="mb-4 text-sm text-neutral-500">
        Reserva spa, pádel, sala de reuniones o una mesa en el rooftop durante tu estancia.
      </p>

      {/* My space bookings */}
      {myBookings.length > 0 && (
        <div className="mb-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Mis reservas
          </h2>
          <div className="space-y-2">
            {myBookings.map((b) => (
              <MyBookingCard key={b.id} booking={b} />
            ))}
          </div>
        </div>
      )}

      {/* Catalogue */}
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        Espacios disponibles
      </h2>
      {isLoading && <p className="py-10 text-center text-sm text-neutral-400">Cargando…</p>}
      <div className="space-y-3">
        {(spaces ?? []).map((s) => {
          const Icon = KIND_ICON[s.kind];
          return (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className="flex w-full items-center gap-3  bg-white p-4 text-left shadow-sm ring-1 ring-neutral-100 active:scale-[0.99]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/10 text-[var(--brand)]">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold text-neutral-900">{s.name}</h3>
                <p className="flex items-center gap-1 truncate text-xs text-neutral-500">
                  <MapPin className="h-3 w-3" /> {s.propertyName}
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-400">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" /> {s.capacity}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {formatHour(s.openHour)}–{formatHour(s.closeHour)}
                  </span>
                </p>
              </div>
              <span className="shrink-0 text-right text-xs font-semibold text-[var(--brand)]">
                {s.pricePerHour === 0 ? "Incluido" : `${s.pricePerHour} €/h`}
              </span>
            </button>
          );
        })}
      </div>

      {selected && <BookingSheet space={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function MyBookingCard({
  booking,
}: {
  booking: Awaited<ReturnType<typeof pms.listSpaceBookings>>[number];
}) {
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => pms.cancelSpaceBooking(booking.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms", "space-bookings"] });
      toast.success("Reserva cancelada");
    },
  });
  const Icon = KIND_ICON[booking.spaceKind];
  return (
    <div className="flex items-center gap-3  bg-white p-3 shadow-sm ring-1 ring-neutral-100">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/10 text-[var(--brand)]">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-neutral-900">{booking.spaceName}</h3>
        <p className="text-xs text-neutral-500">
          {formatDateShort(booking.date)} · {formatHour(booking.startHour)}–
          {formatHour(booking.endHour)}
          {booking.total > 0 && ` · ${eur(booking.total)}`}
        </p>
      </div>
      <button
        onClick={() => cancel.mutate()}
        aria-label="Cancelar"
        className="shrink-0 rounded p-1.5 text-neutral-400 hover:bg-neutral-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function BookingSheet({ space, onClose }: { space: CommonSpace; onClose: () => void }) {
  const { memberId } = useMember();
  const qc = useQueryClient();
  const [date, setDate] = useState(dateOffset(1));
  const [startHour, setStartHour] = useState(space.openHour);
  const [hours, setHours] = useState(1);
  const [guests, setGuests] = useState(1);

  const endHour = Math.min(space.closeHour, startHour + hours);
  const total = Math.max(1, endHour - startHour) * space.pricePerHour;

  const book = useMutation({
    mutationFn: () =>
      pms.bookCommonSpace({ memberId, spaceId: space.id, date, startHour, endHour, guests }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms", "space-bookings"] });
      toast.success(`${space.name} reservada`, {
        description: `${formatDateShort(date)} · ${formatHour(startHour)}–${formatHour(endHour)}`,
      });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startOptions = [];
  for (let h = space.openHour; h < space.closeHour; h++) startOptions.push(h);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--brand)]">
              {SPACE_KIND_LABELS[space.kind]}
            </p>
            <h2 className="text-lg font-semibold">{space.name}</h2>
            <p className="text-xs text-neutral-500">{space.propertyName}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-neutral-500">{space.description}</p>

        <label className="mb-3 block">
          <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            <CalendarDays className="h-3 w-3" /> Día
          </span>
          <input
            type="date"
            value={date}
            min={dateOffset(0)}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
          />
        </label>

        <div className="mb-3 grid grid-cols-3 gap-2">
          <Field label="Desde">
            <select
              value={startHour}
              onChange={(e) => setStartHour(Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-2 text-sm"
            >
              {startOptions.map((h) => (
                <option key={h} value={h}>
                  {formatHour(h)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Horas">
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-2 text-sm"
            >
              {[1, 2, 3, 4].map((h) => (
                <option key={h} value={h}>
                  {h} h
                </option>
              ))}
            </select>
          </Field>
          <Field label="Personas">
            <select
              value={guests}
              onChange={(e) => setGuests(Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-2 text-sm"
            >
              {Array.from({ length: space.capacity }, (_, i) => i + 1).map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mb-4 flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-sm">
          <span className="text-neutral-500">
            {formatHour(startHour)}–{formatHour(endHour)}
          </span>
          <span className="font-semibold text-neutral-900">
            {space.pricePerHour === 0 ? "Incluido" : eur(total)}
          </span>
        </div>

        <button
          onClick={() => book.mutate()}
          disabled={book.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand)] py-3 font-semibold text-white disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> Confirmar reserva
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
        {label}
      </span>
      {children}
    </label>
  );
}
