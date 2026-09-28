import { useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { PAGES } from "../config";
import {
  PACKAGE_IDS,
  PACKAGES,
  PLAN_IDS,
  PLAN_PACKAGES,
  PLANS,
  SLA_TIERS,
  TYPICAL_MIX,
  quote,
  type PlanId,
} from "../../supabase/functions/_shared/plans.ts";

// Pricing as the hotel's own metaphor: the bill. Pick a plan and a size and
// the bill lists what you pay for (the plan), what comes with it (packages)
// and what is optional (SLA). Figures come from the same catalogue as the
// pricing page.

const eur = (n: number) =>
  n.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: n % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });

export function PriceBill() {
  const [plan, setPlan] = useState<PlanId>("starter");
  const [rooms, setRooms] = useState(TYPICAL_MIX.starter.rooms);
  const p = PLANS[plan];
  const q = quote({ plan, rooms, hotels: p.minHotels });
  const included = PLAN_PACKAGES[plan];

  const pick = (id: PlanId) => {
    setPlan(id);
    setRooms(TYPICAL_MIX[id].rooms);
  };
  const step = (d: number) => setRooms((r) => Math.min(400, Math.max(1, r + d)));

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_minmax(0,27rem)] lg:items-start lg:gap-16">
      <div>
        <div role="radiogroup" aria-label="Plan" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PLAN_IDS.map((id) => {
            const on = id === plan;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pick(id)}
                data-spotlight
                className={`relative rounded-xl border px-4 py-3 text-left transition-colors ${
                  on ? "border-night bg-night text-navy-strong" : "surface hover:border-stone/40"
                }`}
              >
                <span className="block text-sm font-semibold">{PLANS[id].name}</span>
                <span
                  className={`font-figure block text-xs whitespace-nowrap ${on ? "text-brass" : "text-stone"}`}
                >
                  {PLANS[id].perRoom} € / hab.
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-6 max-w-xl leading-relaxed text-stone">{p.tagline}</p>
        <div className="mt-6 flex items-center gap-4">
          <span className="text-sm text-stone">Habitaciones</span>
          <div className="surface flex items-center rounded-full">
            <button
              type="button"
              aria-label="Una habitación menos"
              onClick={() => step(rooms > 20 ? -5 : -1)}
              className="rounded-full p-2.5 text-stone transition-colors hover:text-foreground active:scale-95"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="font-figure w-12 text-center text-lg" aria-live="polite">
              {rooms}
            </span>
            <button
              type="button"
              aria-label="Una habitación más"
              onClick={() => step(rooms >= 20 ? 5 : 1)}
              className="rounded-full p-2.5 text-stone transition-colors hover:text-foreground active:scale-95"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {p.minHotels > 1 && (
            <span className="text-xs text-stone">desde {p.minHotels} hoteles</span>
          )}
        </div>
        <ul className="mt-8 grid gap-x-8 gap-y-2 text-sm text-stone sm:grid-cols-2">
          {[
            "Precio publicado, sin presupuestos a ciegas",
            "Pago mensual sin permanencia",
            "0 % de comisión por reserva",
            "Tus datos, exportables cuando quieras",
          ].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <span className="h-1 w-3 rounded-full bg-brass" aria-hidden="true" />
              {t}
            </li>
          ))}
        </ul>
        <a href={PAGES.pricing} className="btn btn-night lean mt-8">
          Calcula tu precio exacto <ArrowRight aria-hidden="true" />
        </a>
      </div>

      {/* The bill */}
      <div className="relative">
        <div
          aria-hidden="true"
          className="absolute inset-x-6 -bottom-3 h-full rounded-2xl bg-sand"
          style={{ transform: "rotate(-1.4deg)" }}
        />
        <div className="surface-lift relative rounded-2xl px-6 pt-6 pb-5">
          <div className="flex items-baseline justify-between border-b border-dashed pb-4">
            <p className="font-display text-2xl">La cuenta</p>
            <p className="font-figure text-xs text-stone">
              Plan {p.name} · {rooms} hab.
            </p>
          </div>
          <dl className="font-figure divide-y divide-dashed text-sm">
            <Line
              label={`${p.name} · ${rooms} × ${p.perRoom} €`}
              value={eur(q.lines[0].amount)}
              strong
            />
            {PACKAGE_IDS.map((id) => (
              <Line
                key={id}
                label={`Paquete ${PACKAGES[id].name}`}
                value={
                  included.includes(id)
                    ? "incluido"
                    : plan === "starter" && id !== "chain"
                      ? "opcional"
                      : "—"
                }
                muted={!included.includes(id)}
              />
            ))}
            <Line
              label="SLA opcional"
              value={
                p.slaAvailable ? `desde +${SLA_TIERS.priority.share * 100} %` : "no disponible"
              }
              muted
            />
          </dl>
          <div className="mt-2 flex items-end justify-between border-t-2 border-foreground/80 pt-4">
            <span className="text-sm">Total al mes</span>
            <span className="font-figure text-3xl font-semibold">
              <AnimatePresence mode="popLayout" initial={false}>
                <m.span
                  key={q.monthly}
                  className="inline-block"
                  initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
                  transition={{ type: "spring", stiffness: 300, damping: 28 }}
                >
                  {eur(q.monthly)}
                </m.span>
              </AnimatePresence>
            </span>
          </div>
          <p className="mt-3 text-xs text-stone">
            Sin IVA. Implantación{" "}
            {q.onboarding ? `${plan === "group" ? "desde " : ""}${eur(q.onboarding)}` : "incluida"}
            {p.onboardingFreeAnnual ? ", gratis con el pago anual" : ""}.
          </p>
        </div>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className={muted ? "text-stone" : "text-foreground"}>{label}</dt>
      <dd
        className={`${strong ? "font-semibold" : ""} ${value === "incluido" ? "text-mineral" : muted ? "text-stone" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
