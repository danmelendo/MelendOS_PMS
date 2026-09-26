import { useEffect, useState } from "react";
import { Building2, CreditCard, ShieldCheck, Sparkles } from "lucide-react";
import { zonedHourToUtc } from "@domain/dates.ts";
import { cancellationTerms, type PaymentMode } from "@domain/policies.ts";
import { usePolicies } from "@/lib/features";
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
 * Price summary, how to pay (the whole stay online now, or at the hotel) and
 * the cancellation terms, with the booking buttons. The hotel's policies
 * decide which options appear.
 */
export function PaymentChoice({
  total,
  checkIn,
  nights,
  disabled,
  busy,
  tone,
  onBook,
}: {
  total: number;
  checkIn: string;
  nights: number;
  disabled: boolean;
  busy: boolean;
  tone: "web" | "app";
  onBook: (mode: PaymentMode, hold: boolean) => void;
}) {
  const policies = usePolicies();
  const [mode, setMode] = useState<PaymentMode>(policies.defaultPaymentMode);
  useEffect(() => {
    if (!policies.paymentModes.includes(mode)) setMode(policies.defaultPaymentMode);
  }, [policies.paymentModes, policies.defaultPaymentMode, mode]);

  const terms = checkIn
    ? cancellationTerms(policies, zonedHourToUtc(checkIn, 15, "Europe/Madrid"), total, nights)
    : null;
  const pad = tone === "web" ? "p-6" : "p-4";

  return (
    <>
      <div className={`mt-4 bg-white shadow-sm ring-1 ring-neutral-100 ${pad}`}>
        <div className="flex items-center justify-between text-sm text-neutral-600">
          <span>Total estancia</span>
          <span className="text-xl font-semibold text-neutral-900">{eur(total)}</span>
        </div>

        {policies.paymentModes.length > 1 && (
          <fieldset className="mt-4 space-y-2">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              ¿Cómo quieres pagar?
            </legend>
            {policies.paymentModes.map((m) => (
              <label
                key={m}
                className={`flex cursor-pointer items-start gap-3 border p-3 text-sm ${
                  mode === m ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-neutral-200"
                }`}
              >
                <input
                  type="radio"
                  name="payment-mode"
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  className="mt-0.5 accent-[var(--brand)]"
                />
                <span>
                  <span className="flex items-center gap-1.5 font-medium">
                    {m === "prepay" ? (
                      <CreditCard className="h-4 w-4" />
                    ) : (
                      <Building2 className="h-4 w-4" />
                    )}
                    {m === "prepay" ? `Pagar ahora online (${eur(total)})` : "Pagar en el hotel"}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {m === "prepay"
                      ? "Pago seguro con tarjeta; la reserva se confirma al pagar."
                      : "Reserva confirmada ya; pagas al llegar."}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {terms && (
          <p className="mt-3 flex gap-2 text-xs text-neutral-600">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>
              Cancelación gratuita hasta el {when(terms.freeUntil)}.
              {policies.penalty !== "none" &&
                ` Después, ${
                  policies.penalty === "full"
                    ? "se cobra la estancia completa"
                    : "se cobra la primera noche"
                }.`}
            </span>
          </p>
        )}
      </div>

      <div className="mt-5 space-y-3">
        <button
          disabled={disabled || busy}
          onClick={() => onBook(mode, false)}
          className="flex w-full items-center justify-center gap-2 bg-[var(--brand)] py-4 font-semibold text-white disabled:opacity-50"
        >
          <ShieldCheck className="h-5 w-5" />
          {mode === "prepay" ? `Reservar y pagar ${eur(total)}` : "Confirmar reserva"}
        </button>
        {mode === "prepay" && (
          <>
            <button
              disabled={disabled || busy}
              onClick={() => onBook(mode, true)}
              className="flex w-full items-center justify-center gap-2 border border-[var(--brand)]/40 bg-white py-4 font-semibold text-[var(--brand)] disabled:opacity-50"
            >
              <Sparkles className="h-5 w-5" /> Guardar 30 min y pagar después
            </button>
            <p className="text-center text-xs text-neutral-400">
              Te guardamos la habitación 30 minutos sin pagar; confírmala antes de que expire.
            </p>
          </>
        )}
      </div>
    </>
  );
}
