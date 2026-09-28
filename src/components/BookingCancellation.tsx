import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { pms, type Prebooking } from "@/integrations/pms";
import { eur } from "@/lib/stays";
import {
  CANCELLATION_CATEGORIES,
  GUEST_CANCELLATION_CATEGORIES,
  type CancellationCategory,
} from "@domain/cancellations.ts";
import { currentLocale, useLang } from "@/lib/i18n";

/** Optional reason, so the hotel learns why guests cancel. */
function ReasonSelect({
  value,
  onChange,
}: {
  value: CancellationCategory | "";
  onChange: (v: CancellationCategory | "") => void;
}) {
  const { t } = useLang();
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-neutral-500">
        {t("¿Por qué cancelas? (opcional)")}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CancellationCategory | "")}
        className="w-full border border-neutral-200 bg-white px-3 py-2 text-sm"
      >
        <option value="">{t("Prefiero no decirlo")}</option>
        {GUEST_CANCELLATION_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {t(CANCELLATION_CATEGORIES[c])}
          </option>
        ))}
      </select>
    </label>
  );
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(currentLocale(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * The booking's cancellation terms and what the guest can do: cancel for free
 * inside the window (refund if paid online), or ask the hotel afterwards (the
 * fee applies). Terms were fixed when the booking was made.
 */
export function BookingCancellation({ booking }: { booking: Prebooking }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState<CancellationCategory | "">("");
  const { t } = useLang();
  const cancel = useMutation({
    mutationFn: () => pms.cancelPrebooking(booking.id, reason || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms"] });
      toast.success(t("Reserva cancelada"), {
        description: booking.paidOnline
          ? t("Te devolveremos {amount} en la misma tarjeta.", { amount: eur(booking.paidAmount) })
          : undefined,
      });
    },
    onError: (e: Error) => toast.error(t(e.message || "No se pudo cancelar")),
  });
  const request = useMutation({
    mutationFn: () => pms.requestCancellation(booking.id, undefined, reason || undefined),
    onSuccess: () =>
      toast.success(t("Solicitud enviada"), { description: t("El hotel te responderá en breve.") }),
    onError: (e: Error) => toast.error(t(e.message || "No se pudo enviar la solicitud")),
  });

  if (!["held", "confirmed"].includes(booking.status)) return null;
  const freeNow =
    booking.status === "held" ||
    !booking.freeCancellationUntil ||
    Date.now() <= Date.parse(booking.freeCancellationUntil);

  return (
    <section className="mt-4 bg-white p-5 text-sm shadow-sm ring-1 ring-neutral-100">
      <h3 className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="h-4 w-4 text-[var(--brand)]" /> {t("Cancelación")}
      </h3>
      {booking.freeCancellationUntil && (
        <p className="mt-1 text-neutral-600">
          {t(freeNow ? "Gratis hasta el {date}." : "El plazo gratuito terminó el {date}.", {
            date: when(booking.freeCancellationUntil),
          })}
          {booking.lateCancellationFee > 0 &&
            ` ${t("Después, el hotel cobra {amount}.", { amount: eur(booking.lateCancellationFee) })}`}
        </p>
      )}

      {freeNow ? (
        confirming ? (
          <div className="mt-3 space-y-2">
            <ReasonSelect value={reason} onChange={setReason} />
            <p className="font-medium">
              {t("¿Cancelar la reserva? No se puede deshacer.")}
              {booking.paidOnline ? ` Te devolvemos ${eur(booking.paidAmount)}.` : ""}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
                className="bg-rose-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
              >
                {t("Sí, cancelar")}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-4 py-2 text-neutral-600"
              >
                {t("Volver")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-3 w-full border border-rose-200 py-2.5 font-medium text-rose-600"
          >
            {t("Cancelar gratis")}
          </button>
        )
      ) : request.isSuccess ? (
        <p className="mt-3 font-medium text-neutral-700">
          {t("Solicitud enviada: el hotel te responderá en breve.")}
        </p>
      ) : confirming ? (
        <div className="mt-3 space-y-2">
          <ReasonSelect value={reason} onChange={setReason} />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={request.isPending}
              onClick={() => request.mutate()}
              className="bg-neutral-900 px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              {t("Enviar la solicitud")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-4 py-2 text-neutral-600"
            >
              {t("Volver")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 w-full border border-neutral-300 py-2.5 font-medium text-neutral-700"
        >
          {t("Solicitar la cancelación al hotel")}
        </button>
      )}
    </section>
  );
}
