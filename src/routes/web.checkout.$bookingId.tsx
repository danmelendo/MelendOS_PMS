import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CreditCard, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { pms } from "@/integrations/pms";
import { DEMO_ACCESS } from "@/lib/demo-access";
import { followPaymentRedirect, paymentReturnSearch } from "@/lib/payments";
import { GuestBookingMissing } from "@/components/GuestBookingMissing";
import { eur, formatDateShort } from "@/lib/stays";

export const Route = createFileRoute("/web/checkout/$bookingId")({
  component: WebCheckoutScreen,
  validateSearch: (s: Record<string, unknown>): { auto?: boolean; payment?: "ok" | "ko" } => ({
    auto: s.auto === true || s.auto === "true",
    ...paymentReturnSearch(s),
  }),
});

function WebCheckoutScreen() {
  const { bookingId } = Route.useParams();
  const { auto, payment } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const autoFired = useRef(false);

  const { data: booking, isPending: bookingLoading } = useQuery({
    queryKey: ["pms", "booking", bookingId],
    queryFn: () => pms.getBooking(bookingId),
    // Back from the gateway the confirmation arrives by server notification:
    // poll quickly until the booking shows as confirmed.
    refetchInterval: (q) => (payment === "ok" && q.state.data?.status === "held" ? 2_000 : 15_000),
  });

  const confirm = useMutation({
    mutationFn: () =>
      pms.startPayment(bookingId, `${window.location.origin}/web/checkout/${bookingId}`),
    onSuccess: (redirect) => {
      qc.invalidateQueries({ queryKey: ["pms"] });
      followPaymentRedirect(redirect);
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo iniciar el pago"),
  });

  useEffect(() => {
    if (auto && booking?.status === "held" && !autoFired.current && !confirm.isPending) {
      autoFired.current = true;
      confirm.mutate();
    }
  }, [auto, booking?.status, confirm]);

  if (!booking) return <GuestBookingMissing loading={bookingLoading} />;

  const expired = booking.status === "expired";
  const alreadyConfirmed = ["confirmed", "in_progress", "completed"].includes(booking.status);
  const awaitingNotification = payment === "ok" && booking.status === "held";

  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/web" })}
          className="flex h-10 w-10 items-center justify-center  border border-neutral-200 bg-white text-neutral-700"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-2xl font-bold">Confirmar y pagar</h1>
      </div>

      {booking.status === "held" && <Countdown until={booking.holdExpiresAt} />}

      <div className=" bg-white p-6 shadow-sm ring-1 ring-neutral-100">
        <h2 className="text-xl font-semibold">{booking.roomName}</h2>
        <p className="text-sm text-neutral-500">{booking.propertyName}</p>
        <div className="mt-4 space-y-2 border-t border-neutral-100 pt-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">Fechas</span>
            <span className="font-medium">
              {formatDateShort(booking.checkIn)} → {formatDateShort(booking.checkOut)} ·{" "}
              {booking.nights} noches
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-neutral-100 pt-2">
            <span className="text-neutral-500">Total estancia</span>
            <span className="font-semibold">{eur(booking.total)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">A pagar ahora</span>
            <span className="text-xl font-bold text-[var(--brand)]">
              {eur(booking.payNow || booking.total)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3  bg-[var(--brand-soft)] px-4 py-3 text-sm text-[var(--brand)]">
        {DEMO_ACCESS
          ? "Pago seguro en el entorno de pruebas de Redsys. Tarjeta de prueba: 4548 8120 4940 0004, caducidad 12/49, CVV 123."
          : "Pago seguro con la pasarela del hotel."}
      </div>

      <div className="mt-6">
        {payment === "ko" && !alreadyConfirmed && (
          <div className="mb-3 bg-rose-50 px-4 py-3 text-center text-sm font-medium text-rose-600">
            El pago no se ha completado. Puedes intentarlo de nuevo.
          </div>
        )}
        {awaitingNotification ? (
          <div className="flex items-center justify-center gap-2 bg-sky-50 py-4 text-sm font-medium text-sky-700">
            <Clock className="h-4 w-4 animate-pulse" /> Confirmando el pago con el banco…
          </div>
        ) : alreadyConfirmed ? (
          <button
            onClick={() => navigate({ to: "/web/sign/$bookingId", params: { bookingId } })}
            className="flex w-full items-center justify-center gap-2  bg-emerald-600 py-4 font-semibold text-white"
          >
            <CheckCircle2 className="h-5 w-5" /> Reserva confirmada · firmar check-in
          </button>
        ) : expired ? (
          <div className=" bg-rose-50 px-4 py-3 text-center text-sm font-medium text-rose-600">
            La prereserva ha expirado. Vuelve a buscar disponibilidad.
          </div>
        ) : (
          <button
            disabled={confirm.isPending}
            onClick={() => confirm.mutate()}
            className="flex w-full items-center justify-center gap-2  bg-[var(--brand)] py-4 font-semibold text-white disabled:opacity-50"
          >
            <CreditCard className="h-5 w-5" />
            {confirm.isPending
              ? "Redirigiendo al pago…"
              : `Pagar ${eur(booking.payNow || booking.total)}`}
          </button>
        )}
      </div>
    </div>
  );
}

function Countdown({ until }: { until: string | null }) {
  const [left, setLeft] = useState(() => remaining(until));
  useEffect(() => {
    const t = setInterval(() => setLeft(remaining(until)), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (left <= 0) return null;
  const m = Math.floor(left / 60);
  const s = left % 60;
  return (
    <div className="mb-4 flex items-center justify-center gap-2  bg-amber-50 py-3 text-sm font-medium text-amber-700">
      <Clock className="h-4 w-4" /> Prereserva activa · expira en {m}:{String(s).padStart(2, "0")}
    </div>
  );
}

function remaining(until: string | null): number {
  if (!until) return 0;
  return Math.max(0, Math.floor((new Date(until).getTime() - Date.now()) / 1000));
}
