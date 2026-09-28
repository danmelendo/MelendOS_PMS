import { useState } from "react";
import { CalendarPlus, ConciergeBell, Minus, Plus, Receipt } from "lucide-react";
import { toast } from "sonner";
import { addDays } from "@domain/dates.ts";
import { pms } from "@/integrations/pms";
import { followPaymentRedirect } from "@/lib/payments";
import { eur } from "@/lib/stays";
import {
  SERVICE_CATEGORIES,
  useFolio,
  useOrderService,
  useRequestExtension,
  useStayServices,
} from "@/lib/folio";
import { currentLocale, useLang } from "@/lib/i18n";

const longDay = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString(currentLocale(), {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

/**
 * The guest's bill during and after the stay: charges, balance, ordering
 * services, asking to stay longer and paying what is pending.
 */
export function StayFolio({
  reservationId,
  propertyId,
  token,
  status,
  checkOut,
}: {
  reservationId: string;
  propertyId: string;
  token: string | null;
  /** Booking status as the guest app shows it (held, confirmed, in_progress…). */
  status: string;
  checkOut: string;
}) {
  const active = status === "confirmed" || status === "in_progress";
  const visible = active || status === "completed";
  const { data: folio } = useFolio(reservationId, token, visible);
  const { data: services } = useStayServices(active ? propertyId : null);
  const order = useOrderService(reservationId, token);
  const extend = useRequestExtension(reservationId, token);
  const [panel, setPanel] = useState<"none" | "services" | "extend">("none");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [newCheckOut, setNewCheckOut] = useState(addDays(checkOut, 1));
  const [paying, setPaying] = useState(false);
  const { t } = useLang();

  if (!visible || !folio) return null;
  const ext = folio.extension;

  const pay = async () => {
    setPaying(true);
    try {
      const redirect = await pms.startPayment(reservationId, window.location.href, "balance");
      followPaymentRedirect(redirect);
    } catch (e) {
      toast.error((e as Error).message);
      setPaying(false);
    }
  };

  const grouped = Object.entries(SERVICE_CATEGORIES)
    .map(([k, label]) => ({
      label: t(label),
      items: (services ?? []).filter((s) => s.category === k),
    }))
    .filter((g) => g.items.length);

  return (
    <section className="mt-4 bg-white p-5 shadow-sm ring-1 ring-neutral-100">
      <h3 className="flex items-center gap-2 font-semibold">
        <Receipt className="h-4 w-4 text-[var(--brand)]" /> {t("Tu cuenta")}
      </h3>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-600">{t("Reserva")}</dt>
          <dd className="tabular-nums">{eur(folio.booking_total)}</dd>
        </div>
        {folio.charges.map((c) => (
          <div key={c.id} className="flex justify-between gap-3">
            <dt className="min-w-0 truncate text-neutral-600">
              {Number(c.qty) !== 1 ? `${Number(c.qty)} × ` : ""}
              {c.description}
              {c.status === "requested" && (
                <span className="ml-1.5 text-[11px] text-amber-700">
                  {t("pendiente de confirmar")}
                </span>
              )}
            </dt>
            <dd className={`tabular-nums ${c.status === "requested" ? "text-neutral-400" : ""}`}>
              {eur(Number(c.amount))}
            </dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 text-neutral-500">
          <dt>{t("Pagado")}</dt>
          <dd className="tabular-nums">−{eur(folio.paid)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-neutral-100 pt-1.5 font-semibold">
          <dt>{t("Pendiente")}</dt>
          <dd className="tabular-nums">{eur(Math.max(folio.balance, 0))}</dd>
        </div>
      </dl>

      {ext && ext.status === "pending" && (
        <p className="mt-3 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t("Ampliación hasta el {date} ({amount}) pendiente de confirmar por recepción.", {
            date: longDay(ext.new_check_out),
            amount: eur(Number(ext.amount)),
          })}
        </p>
      )}
      {ext && ext.status === "approved" && (
        <p className="mt-3 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {t("Estancia ampliada hasta el {date}.", { date: longDay(ext.new_check_out) })}
        </p>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {active && (
          <button
            type="button"
            onClick={() => setPanel(panel === "services" ? "none" : "services")}
            className="flex items-center justify-center gap-2 border border-neutral-300 py-2.5 text-sm font-semibold"
          >
            <ConciergeBell className="h-4 w-4" /> {t("Pedir un servicio")}
          </button>
        )}
        {active && (!ext || ext.status !== "pending") && (
          <button
            type="button"
            onClick={() => setPanel(panel === "extend" ? "none" : "extend")}
            className="flex items-center justify-center gap-2 border border-neutral-300 py-2.5 text-sm font-semibold"
          >
            <CalendarPlus className="h-4 w-4" /> {t("Ampliar estancia")}
          </button>
        )}
        {folio.balance > 0 && (
          <button
            type="button"
            disabled={paying}
            onClick={pay}
            className="bg-[var(--brand)] py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2"
          >
            {paying
              ? t("Abriendo el pago…")
              : t("Pagar pendiente ({amount})", { amount: eur(folio.balance) })}
          </button>
        )}
      </div>

      {panel === "services" && (
        <div className="mt-4 space-y-4 border-t border-neutral-100 pt-4">
          {grouped.map((g) => (
            <div key={g.label}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                {g.label}
              </p>
              <ul className="space-y-2">
                {g.items.map((s) => {
                  const n = qty[s.id] ?? 1;
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-neutral-500">
                          {eur(Number(s.price))} / {s.unit}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          aria-label={t("Menos {x}", { x: s.name })}
                          onClick={() => setQty({ ...qty, [s.id]: Math.max(1, n - 1) })}
                          className="flex h-8 w-8 items-center justify-center border border-neutral-200"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm tabular-nums">{n}</span>
                        <button
                          type="button"
                          aria-label={t("Más {x}", { x: s.name })}
                          onClick={() => setQty({ ...qty, [s.id]: Math.min(20, n + 1) })}
                          className="flex h-8 w-8 items-center justify-center border border-neutral-200"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={order.isPending}
                          onClick={() =>
                            order.mutate(
                              { serviceId: s.id, qty: n },
                              {
                                onSuccess: () =>
                                  toast.success(t("Pedido enviado"), {
                                    description: t("Recepción lo confirmará en el chat."),
                                  }),
                                onError: (e) => toast.error(e.message),
                              },
                            )
                          }
                          className="ml-1 bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {t("Pedir")}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {grouped.length === 0 && (
            <p className="text-sm text-neutral-500">
              {t("Este hotel no ofrece servicios durante la estancia.")}
            </p>
          )}
        </div>
      )}

      {panel === "extend" && (
        <div className="mt-4 space-y-3 border-t border-neutral-100 pt-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-400">
              {t("Nueva fecha de salida")}
            </span>
            <input
              type="date"
              value={newCheckOut}
              min={addDays(checkOut, 1)}
              max={addDays(checkOut, 14)}
              onChange={(e) => setNewCheckOut(e.target.value)}
              className="border border-neutral-200 px-3 py-2 text-sm"
            />
          </label>
          <p className="text-xs text-neutral-500">
            {t(
              "Calculamos el precio de las noches extra en tu misma habitación. Recepción te lo confirma en el chat.",
            )}
          </p>
          <button
            type="button"
            disabled={extend.isPending}
            onClick={() =>
              extend.mutate(newCheckOut, {
                onSuccess: (q) => {
                  setPanel("none");
                  toast.success(t("Ampliación solicitada"), {
                    description: t("{n} {nights} más por {amount}.", {
                      n: q.nights,
                      nights: t(q.nights === 1 ? "noche" : "noches"),
                      amount: eur(q.amount),
                    }),
                  });
                },
                onError: (e) => toast.error(e.message),
              })
            }
            className="w-full bg-[var(--brand)] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t(extend.isPending ? "Consultando…" : "Solicitar ampliación")}
          </button>
        </div>
      )}
    </section>
  );
}
