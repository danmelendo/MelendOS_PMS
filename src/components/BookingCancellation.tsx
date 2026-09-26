import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { pms, type Prebooking } from "@/integrations/pms";
import { eur } from "@/lib/stays";

const when = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", {
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
  const cancel = useMutation({
    mutationFn: () => pms.cancelPrebooking(booking.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms"] });
      toast.success("Reserva cancelada", {
        description: booking.paidOnline
          ? `Te devolveremos ${eur(booking.paidAmount)} en la misma tarjeta.`
          : undefined,
      });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo cancelar"),
  });
  const request = useMutation({
    mutationFn: () => pms.requestCancellation(booking.id),
    onSuccess: () =>
      toast.success("Solicitud enviada", { description: "El hotel te responderá en breve." }),
    onError: (e: Error) => toast.error(e.message || "No se pudo enviar la solicitud"),
  });

  if (!["held", "confirmed"].includes(booking.status)) return null;
  const freeNow =
    booking.status === "held" ||
    !booking.freeCancellationUntil ||
    Date.now() <= Date.parse(booking.freeCancellationUntil);

  return (
    <section className="mt-4 bg-white p-5 text-sm shadow-sm ring-1 ring-neutral-100">
      <h3 className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="h-4 w-4 text-[var(--brand)]" /> Cancelación
      </h3>
      {booking.freeCancellationUntil && (
        <p className="mt-1 text-neutral-600">
          {freeNow ? "Gratis hasta el " : "El plazo gratuito terminó el "}
          {when(booking.freeCancellationUntil)}.
          {booking.lateCancellationFee > 0 &&
            ` Después, el hotel cobra ${eur(booking.lateCancellationFee)}.`}
        </p>
      )}

      {freeNow ? (
        confirming ? (
          <div className="mt-3 space-y-2">
            <p className="font-medium">
              ¿Cancelar la reserva? No se puede deshacer.
              {booking.paidOnline ? ` Te devolvemos ${eur(booking.paidAmount)}.` : ""}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
                className="bg-rose-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
              >
                Sí, cancelar
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-4 py-2 text-neutral-600"
              >
                Volver
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-3 w-full border border-rose-200 py-2.5 font-medium text-rose-600"
          >
            Cancelar gratis
          </button>
        )
      ) : (
        <button
          type="button"
          disabled={request.isPending || request.isSuccess}
          onClick={() => request.mutate()}
          className="mt-3 w-full border border-neutral-300 py-2.5 font-medium text-neutral-700 disabled:opacity-50"
        >
          {request.isSuccess ? "Solicitud enviada" : "Solicitar la cancelación al hotel"}
        </button>
      )}
    </section>
  );
}
