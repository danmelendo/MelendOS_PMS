import { BookingCancellation } from "@/components/BookingCancellation";
import { paymentLabel } from "@/lib/stays";
import { StayFolio } from "@/components/StayFolio";
import { MessagesSquare } from "lucide-react";
import { chatOpen } from "@/lib/chat";
import { GuestReview } from "@/components/Reviews";
import { guestToken } from "@/integrations/pms/demo-stays-connector";
import { useFeatures } from "@/lib/features";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
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
  Home,
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
import { GuestBookingMissing } from "@/components/GuestBookingMissing";

export const Route = createFileRoute("/web/booking/$bookingId")({
  component: WebBookingDetail,
});

const EVENT_META: Record<
  JournalEventType,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  created: { label: "Reserva creada", icon: Sparkles },
  prebooked: { label: "Prereserva creada", icon: Sparkles },
  checked_out: { label: "Check-out realizado", icon: LogIn },
  rejected: { label: "Pago no completado", icon: Ban },
  no_show: { label: "No presentado", icon: Ban },
  confirmed: { label: "Reserva confirmada", icon: CheckCircle2 },
  signed: { label: "Registro de viajeros firmado", icon: PenLine },
  checked_in: { label: "Check-in realizado", icon: LogIn },
  cancelled: { label: "Reserva cancelada", icon: Ban },
  points_earned: { label: "Puntos acreditados", icon: Sparkles },
  reward_redeemed: { label: "Recompensa canjeada", icon: Sparkles },
};

function WebBookingDetail() {
  const { bookingId } = Route.useParams();
  const features = useFeatures();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: booking, isPending: bookingLoading } = useQuery({
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

  if (!booking) return <GuestBookingMissing loading={bookingLoading} />;

  const canSign =
    ["confirmed", "in_progress"].includes(booking.status) && signature?.status !== "signed";
  const timeline = [...(journal ?? [])].reverse();

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/web"
          className="flex h-10 w-10 items-center justify-center  border border-neutral-200 bg-white text-neutral-700"
        >
          <Home className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-bold">Detalle de reserva</h1>
      </div>

      <div className=" bg-white p-6 shadow-sm ring-1 ring-neutral-100">
        <span
          className={` border px-2 py-0.5 text-[11px] font-medium ${BOOKING_STATUS_CLASSES[booking.status]}`}
        >
          {BOOKING_STATUS_LABELS[booking.status]}
        </span>
        <span className="ml-2 font-mono text-xs text-neutral-500">Ref. {booking.reference}</span>
        <h2 className="mt-2 text-2xl font-semibold">{booking.roomName}</h2>
        <p className="text-neutral-500">{booking.propertyName}</p>

        <div className="mt-4 space-y-2 border-t border-neutral-100 pt-4 text-sm">
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
            {eur(booking.total)} · {paymentLabel(booking)}
          </DRow>
        </div>
      </div>

      {/* Signature */}
      <div className="mt-4 flex items-center justify-between  bg-white p-5 shadow-sm ring-1 ring-neutral-100">
        <span className="flex items-center gap-2 font-medium text-neutral-700">
          <FileSignature className="h-5 w-5 text-[var(--brand)]" /> Check-in online
        </span>
        {signature?.status === "signed" ? (
          <span className="flex items-center gap-1.5 font-medium text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Firmado
          </span>
        ) : canSign ? (
          <button
            onClick={() => navigate({ to: "/web/sign/$bookingId", params: { bookingId } })}
            className=" bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
          >
            Firmar
          </button>
        ) : (
          <span className="flex items-center gap-1 text-sm text-neutral-400">
            <XCircle className="h-4 w-4" /> Pendiente
          </span>
        )}
      </div>

      {features.folio && (
        <StayFolio
          reservationId={booking.id}
          propertyId={booking.propertyId}
          token={guestToken(booking.id)}
          status={booking.status}
          checkOut={booking.checkOut}
        />
      )}

      {features.chat && chatOpen(booking.status, booking.checkOut) && (
        <Link
          to="/web/chat/$bookingId"
          params={{ bookingId: booking.id }}
          className="mt-4 flex items-center justify-center gap-2 bg-[var(--brand)] py-3 text-sm font-semibold text-white"
        >
          <MessagesSquare className="h-4 w-4" /> Hablar con recepción
        </Link>
      )}

      <GuestReview
        reservationId={booking.id}
        token={guestToken(booking.id)}
        completed={booking.status === "completed" && features.reviews}
      />

      {/* Timeline */}
      <div className="mt-4  bg-white p-6 shadow-sm ring-1 ring-neutral-100">
        <h3 className="mb-4 flex items-center gap-2 font-semibold text-neutral-700">
          <ClipboardList className="h-5 w-5" /> Historial de la reserva
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

      <BookingCancellation booking={booking} />

      <div className="mt-5 text-center">
        <Link to="/web" className="text-sm font-medium text-[var(--brand)]">
          Volver al inicio
        </Link>
      </div>
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
