import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CreditCard, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import type { PaymentRedirect } from "@/integrations/pms";
import { pms } from "@/integrations/pms";
import { DEMO_ACCESS } from "@/lib/demo-access";
import { paymentReturnSearch } from "@/lib/payments";
import { GuestBookingMissing } from "@/components/GuestBookingMissing";
import { PaymentModal } from "@/components/PaymentModal";
import { eur, formatDateShort } from "@/lib/stays";
import { useLang } from "@/lib/i18n";

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
  const { t } = useLang();

  const { data: booking, isPending: bookingLoading } = useQuery({
    queryKey: ["pms", "booking", bookingId],
    queryFn: () => pms.getBooking(bookingId),
    // Back from the gateway the confirmation arrives by server notification:
    // poll quickly until the booking shows as confirmed.
    refetchInterval: (q) => (payment === "ok" && q.state.data?.status === "held" ? 2_000 : 15_000),
  });

  // When the gateway returns inside our payment iframe, tell the parent page
  // how it went so the modal can close and start polling for confirmation.
  useEffect(() => {
    if (payment && window.self !== window.top) {
      window.parent.postMessage({ melendos_payment: payment }, window.location.origin);
    }
  }, [payment]);
  const framed = payment && typeof window !== "undefined" && window.self !== window.top;

  // The gateway shown in an in-page overlay; the guest never leaves the site.
  const [redirect, setRedirect] = useState<PaymentRedirect | null>(null);
  const confirm = useMutation({
    mutationFn: () =>
      pms.startPayment(bookingId, `${window.location.origin}/web/checkout/${bookingId}`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["pms"] });
      setRedirect(r);
    },
    onError: (e: Error) => toast.error(t(e.message || "No se pudo iniciar el pago")),
  });

  useEffect(() => {
    if (auto && booking?.status === "held" && !autoFired.current && !confirm.isPending) {
      autoFired.current = true;
      confirm.mutate();
    }
  }, [auto, booking?.status, confirm]);

  // Inside the payment iframe we only report the result up (above) and show a
  // spinner; the real page is the parent one.
  if (framed)
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-neutral-500">
        <Clock className="h-6 w-6 animate-pulse" />
      </div>
    );

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
        <h1 className="text-2xl font-bold">{t("Confirmar y pagar")}</h1>
      </div>

      {booking.status === "held" && <Countdown until={booking.holdExpiresAt} />}

      <div className=" bg-white p-6 shadow-sm ring-1 ring-neutral-100">
        <h2 className="text-xl font-semibold">{booking.roomName}</h2>
        <p className="text-sm text-neutral-500">{booking.propertyName}</p>
        <div className="mt-4 space-y-2 border-t border-neutral-100 pt-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">{t("Fechas")}</span>
            <span className="font-medium">
              {formatDateShort(booking.checkIn)} → {formatDateShort(booking.checkOut)} ·{" "}
              {booking.nights} {t(booking.nights === 1 ? "noche" : "noches")}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-neutral-100 pt-2">
            <span className="text-neutral-500">{t("Total estancia")}</span>
            <span className="font-semibold">{eur(booking.total)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">{t("A pagar ahora")}</span>
            <span className="text-xl font-bold text-[var(--brand)]">
              {eur(booking.payNow || booking.total)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3  bg-[var(--brand-soft)] px-4 py-3 text-sm text-[var(--brand)]">
        {t(
          DEMO_ACCESS
            ? "Pago seguro en el entorno de pruebas de Redsys. Tarjeta de prueba: 4548 8120 4940 0004, caducidad 12/49, CVV 123."
            : "Pago seguro con la pasarela del hotel.",
        )}
      </div>

      <div className="mt-6">
        {payment === "ko" && !alreadyConfirmed && (
          <div className="mb-3 bg-rose-50 px-4 py-3 text-center text-sm font-medium text-rose-600">
            {t("El pago no se ha completado. Puedes intentarlo de nuevo.")}
          </div>
        )}
        {awaitingNotification ? (
          <div className="flex items-center justify-center gap-2 bg-sky-50 py-4 text-sm font-medium text-sky-700">
            <Clock className="h-4 w-4 animate-pulse" /> {t("Confirmando el pago con el banco…")}
          </div>
        ) : alreadyConfirmed ? (
          <button
            onClick={() => navigate({ to: "/web/checkin/$bookingId", params: { bookingId } })}
            className="flex w-full items-center justify-center gap-2  bg-emerald-600 py-4 font-semibold text-white"
          >
            <CheckCircle2 className="h-5 w-5" />{" "}
            {t("Reserva confirmada · hacer el check-in online")}
          </button>
        ) : expired ? (
          <div className=" bg-rose-50 px-4 py-3 text-center text-sm font-medium text-rose-600">
            {t("La prereserva ha expirado. Vuelve a buscar disponibilidad.")}
          </div>
        ) : (
          <button
            disabled={confirm.isPending}
            onClick={() => confirm.mutate()}
            className="flex w-full items-center justify-center gap-2  bg-[var(--brand)] py-4 font-semibold text-white disabled:opacity-50"
          >
            <CreditCard className="h-5 w-5" />
            {confirm.isPending
              ? t("Redirigiendo al pago…")
              : t("Pagar {amount}", { amount: eur(booking.payNow || booking.total) })}
          </button>
        )}
      </div>

      {redirect && (
        <PaymentModal
          redirect={redirect}
          amountLabel={eur(booking.payNow || booking.total)}
          onResult={(result) => {
            setRedirect(null);
            navigate({
              to: "/web/checkout/$bookingId",
              params: { bookingId },
              search: { payment: result },
            });
          }}
          onClose={() => setRedirect(null)}
        />
      )}
    </div>
  );
}

function Countdown({ until }: { until: string | null }) {
  const [left, setLeft] = useState(() => remaining(until));
  const { t } = useLang();
  useEffect(() => {
    const timer = setInterval(() => setLeft(remaining(until)), 1000);
    return () => clearInterval(timer);
  }, [until]);
  if (left <= 0) return null;
  const m = Math.floor(left / 60);
  const s = left % 60;
  return (
    <div className="mb-4 flex items-center justify-center gap-2  bg-amber-50 py-3 text-sm font-medium text-amber-700">
      <Clock className="h-4 w-4" />{" "}
      {t("Prereserva activa · expira en {time}", { time: `${m}:${String(s).padStart(2, "0")}` })}
    </div>
  );
}

function remaining(until: string | null): number {
  if (!until) return 0;
  return Math.max(0, Math.floor((new Date(until).getTime() - Date.now()) / 1000));
}
