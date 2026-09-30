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

  // The hold lapsed with the gateway still open (30 minutes at the bank without
  // an answer): close it, the guest has to book again.
  const lapsed = booking?.status === "expired" && payment !== "ok";
  useEffect(() => {
    if (lapsed) setRedirect(null);
  }, [lapsed]);

  // Inside the payment iframe we only report the result up (above) and show a
  // spinner; the real page is the parent one.
  if (framed)
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-neutral-500">
        <Clock className="h-6 w-6 animate-pulse" />
      </div>
    );

  if (!booking) return <GuestBookingMissing loading={bookingLoading} />;

  const alreadyConfirmed = ["confirmed", "in_progress", "completed"].includes(booking.status);
  // Back from the bank the confirmation may take a moment; the hold is not
  // what matters any more (a late payment is still confirmed or refunded).
  const awaitingNotification =
    payment === "ok" && (booking.status === "held" || booking.status === "expired");
  const expired = booking.status === "expired" && !awaitingNotification;

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

      {booking.status === "held" && !awaitingNotification && (
        <SessionTimer
          until={booking.holdExpiresAt}
          onLapse={() => qc.invalidateQueries({ queryKey: ["pms", "booking", bookingId] })}
        />
      )}

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
          <div className="space-y-3 bg-rose-50 px-4 py-4 text-center text-sm font-medium text-rose-600">
            <p>
              {t(
                "Tu sesión de reserva ha caducado. Vuelve a reservar: si la habitación sigue libre, será tuya.",
              )}
            </p>
            <button
              onClick={() =>
                navigate({ to: "/web/room/$roomId", params: { roomId: booking.roomId } })
              }
              className="bg-[var(--brand)] px-4 py-2 font-semibold text-white"
            >
              {t("Volver a la habitación")}
            </button>
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

/** Warn when this much of the session is left (seconds). */
const WARN_AT = [5 * 60, 60];

/**
 * The booking session: the room is held for 20 minutes from when the guest
 * started booking (30 once they are at the bank), fixed by the server and never
 * extended. The countdown shows what is left and warns at 5 minutes and at 1
 * minute; when it runs out the guest has to book again.
 */
function SessionTimer({ until, onLapse }: { until: string | null; onLapse: () => void }) {
  const { t } = useLang();
  const [left, setLeft] = useState(() => remaining(until));
  const warned = useRef(new Set<number>());
  const lapse = useRef(onLapse);
  lapse.current = onLapse;

  useEffect(() => {
    const tick = () => {
      const l = remaining(until);
      setLeft(l);
      // One warning per threshold (the first one right away if the page was
      // opened with less time left).
      const due = WARN_AT.filter((w) => l > 0 && l <= w && !warned.current.has(w));
      if (due.length) {
        for (const w of WARN_AT) if (l <= w) warned.current.add(w);
        const minutes = Math.max(1, Math.ceil(l / 60));
        toast.warning(
          minutes === 1
            ? t(
                "Tu sesión va a caducar en 1 minuto. Completa el pago o tendrás que volver a reservar.",
              )
            : t(
                "Tu sesión va a caducar en {n} minutos. Completa el pago o tendrás que volver a reservar.",
                { n: minutes },
              ),
          { duration: 20_000 },
        );
      }
      if (l <= 0) {
        clearInterval(timer);
        lapse.current();
      }
    };
    const timer = setInterval(tick, 1000);
    tick();
    return () => clearInterval(timer);
  }, [until, t]);

  if (left <= 0) return null;
  const m = Math.floor(left / 60);
  const s = left % 60;
  const urgent = left <= WARN_AT[0];
  return (
    <div
      role="timer"
      aria-live={urgent ? "assertive" : "off"}
      className={`mb-4 flex items-center justify-center gap-2 px-3 py-3 text-center text-sm font-medium ${
        urgent ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      <Clock className="h-4 w-4 shrink-0" />{" "}
      {t(
        urgent
          ? "Tu sesión va a caducar · quedan {time} para completar el pago"
          : "Habitación reservada para ti · tu sesión caduca en {time}",
        { time: `${m}:${String(s).padStart(2, "0")}` },
      )}
    </div>
  );
}

function remaining(until: string | null): number {
  if (!until) return 0;
  return Math.max(0, Math.floor((new Date(until).getTime() - Date.now()) / 1000));
}
