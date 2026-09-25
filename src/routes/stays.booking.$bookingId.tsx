import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  Users,
  FileSignature,
  CheckCircle2,
  XCircle,
  Sparkles,
  LogIn,
  Ban,
  ClipboardList,
  PenLine,
} from "lucide-react";
import { toast } from "sonner";
import { pms } from "@/integrations/pms";
import {
  BOOKING_STATUS_CLASSES,
  BOOKING_STATUS_LABELS,
  eur,
  formatDateLong,
  formatDateShort,
} from "@/lib/stays";
import type { JournalEventType } from "@/integrations/pms";

export const Route = createFileRoute("/stays/booking/$bookingId")({
  component: BookingDetailScreen,
});

const EVENT_META: Record<
  JournalEventType,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  prebooked: { label: "Prereserva creada", icon: Sparkles },
  confirmed: { label: "Reserva confirmada · señal pagada", icon: CheckCircle2 },
  signed: { label: "Registro de viajeros firmado", icon: PenLine },
  checked_in: { label: "Check-in realizado", icon: LogIn },
  cancelled: { label: "Reserva cancelada", icon: Ban },
  points_earned: { label: "Puntos del Club acreditados", icon: Sparkles },
  reward_redeemed: { label: "Recompensa canjeada", icon: Sparkles },
};

function BookingDetailScreen() {
  const { bookingId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: booking } = useQuery({
    queryKey: ["pms", "booking", bookingId],
    queryFn: () => pms.getBooking(bookingId),
  });
  const { data: signature } = useQuery({
    queryKey: ["pms", "signature", bookingId],
    queryFn: () => pms.getSignature(bookingId),
  });
  const { data: journal } = useQuery({
    queryKey: ["pms", "journal", bookingId],
    queryFn: () => pms.listJournal({ bookingRef: bookingId }),
  });

  const cancel = useMutation({
    mutationFn: () => pms.cancelPrebooking(bookingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms"] });
      toast.success("Reserva cancelada");
    },
    onError: () => toast.error("No se pudo cancelar"),
  });

  if (!booking) return <p className="px-5 py-16 text-center text-sm text-neutral-400">Cargando…</p>;

  const canSign =
    ["confirmed", "in_progress"].includes(booking.status) && signature?.status !== "signed";
  const canCancel = ["held", "confirmed"].includes(booking.status);
  const timeline = [...(journal ?? [])].reverse(); // oldest → newest

  return (
    <div className="px-5 pt-6">
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/stays/trips" })}
          className="flex h-9 w-9 items-center justify-center  bg-white ring-1 ring-neutral-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-lg font-semibold">Detalle de reserva</h1>
      </div>

      <div className=" bg-white p-4 shadow-sm ring-1 ring-neutral-100">
        <span
          className={` border px-2 py-0.5 text-[11px] font-medium ${BOOKING_STATUS_CLASSES[booking.status]}`}
        >
          {BOOKING_STATUS_LABELS[booking.status]}
        </span>
        <h2 className="mt-2 text-xl font-semibold">{booking.roomName}</h2>
        <p className="text-sm text-neutral-500">{booking.propertyName}</p>

        <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3 text-sm">
          <DRow icon={CalendarDays} label="Entrada">
            {formatDateLong(`${booking.checkIn}T15:00:00`)}
          </DRow>
          <DRow icon={CalendarDays} label="Salida">
            {formatDateLong(`${booking.checkOut}T12:00:00`)}
          </DRow>
          <DRow icon={Users} label="Huéspedes">
            {booking.guests}
          </DRow>
          <DRow icon={ClipboardList} label="Total">
            {eur(booking.total)} · señal {eur(booking.deposit)}
          </DRow>
        </div>
      </div>

      {/* Signature status */}
      <div className="mt-3 flex items-center justify-between  bg-white p-4 shadow-sm ring-1 ring-neutral-100">
        <span className="flex items-center gap-2 text-sm font-medium text-neutral-700">
          <FileSignature className="h-4 w-4 text-[var(--brand)]" /> Check-in online
        </span>
        {signature?.status === "signed" ? (
          <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Firmado
          </span>
        ) : canSign ? (
          <button
            onClick={() => navigate({ to: "/stays/sign/$bookingId", params: { bookingId } })}
            className=" bg-[var(--brand)] px-4 py-1.5 text-sm font-semibold text-white"
          >
            Firmar
          </button>
        ) : (
          <span className="flex items-center gap-1 text-sm text-neutral-400">
            <XCircle className="h-4 w-4" /> Pendiente
          </span>
        )}
      </div>

      {/* Booking journal timeline */}
      <div className="mt-3  bg-white p-4 shadow-sm ring-1 ring-neutral-100">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-700">
          <ClipboardList className="h-4 w-4" /> Historial de la reserva
        </h3>
        <ol className="relative space-y-4 border-l border-neutral-200 pl-5">
          {timeline.length === 0 && (
            <li className="text-sm text-neutral-400">Sin eventos todavía.</li>
          )}
          {timeline.map((e) => {
            const meta = EVENT_META[e.eventType];
            const Icon = meta?.icon ?? ClipboardList;
            return (
              <li key={e.id} className="relative">
                <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center  bg-[var(--brand)] text-white">
                  <Icon className="h-3 w-3" />
                </span>
                <p className="text-sm font-medium text-neutral-800">{meta?.label ?? e.eventType}</p>
                <p className="text-xs text-neutral-400">
                  {new Date(e.createdAt).toLocaleString("es-ES", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {typeof e.payload.points === "number" ? ` · +${e.payload.points} pts` : ""}
                </p>
              </li>
            );
          })}
        </ol>
      </div>

      {canCancel && (
        <button
          disabled={cancel.isPending}
          onClick={() => cancel.mutate()}
          className="mt-4 w-full  border border-rose-200 py-3 text-sm font-medium text-rose-600 disabled:opacity-50"
        >
          Cancelar reserva
        </button>
      )}
    </div>
  );
}

function DRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-neutral-500">
        <Icon className="h-4 w-4" /> {label}
      </span>
      <span className="text-right font-medium text-neutral-800">{children}</span>
    </div>
  );
}
