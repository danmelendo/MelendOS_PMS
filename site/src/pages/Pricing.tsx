import { useState, type ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import { ArrowRight, Minus, Sparkles } from "lucide-react";
import { Layout } from "../components/Layout";
import { HeroPhoto } from "../components/HeroPhoto";
import { Marker, SectionHead, Tick } from "../components/ui";
import { PAGES } from "../config";
import { PRICING_FAQ as FAQ } from "../content/faq";
import {
  ADDON_IDS,
  ADDONS,
  AI_CONVERSATIONS_INCLUDED,
  AI_EXTRA_CONVERSATION,
  ALWAYS,
  ANNUAL_DISCOUNT,
  BASE_SUPPORT,
  FOUNDERS,
  PACKAGE_IDS,
  PACKAGES,
  PLAN_IDS,
  PLAN_PACKAGES,
  PLANS,
  SLA_IDS,
  SLA_TIERS,
  downtimeMinutes,
  listPrice,
  quote,
  suggestPlan,
  type AddonId,
  type PackageId,
  type PlanId,
  type SlaId,
} from "../../supabase/functions/_shared/plans.ts";

// Pricing as a bill: controls on top, the four plans as choices, and a bill
// that lists, line by line, what the chosen plan costs. Same catalogue and
// the same rules as before (plans.ts).

const FIELD =
  "h-10 rounded-lg border border-input bg-card px-3 text-sm tabular-nums shadow-[var(--shadow-rest)] focus-visible:outline-2 focus-visible:outline-ring";

const eur = (n: number, decimals = 0) =>
  n.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
const eur2 = (n: number) => eur(n, n % 1 ? 2 : 0);
const pct = (n: number) => `${n.toLocaleString("es-ES")} %`;
const clampInt = (v: string, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(Number(v) || min)));

export function PricingPage() {
  const [rooms, setRooms] = useState(30);
  const [hotels, setHotels] = useState(1);
  const [annual, setAnnual] = useState(false);
  const [addons, setAddons] = useState<AddonId[]>([]);
  const [sla, setSla] = useState<SlaId | "">("");
  const [chosen, setChosen] = useState<PlanId | null>(null);

  const suggested = suggestPlan(rooms, hotels, addons);
  // Follows the suggestion until the visitor picks a plan; a group plan needs 2+ hotels.
  const plan: PlanId = chosen && hotels >= PLANS[chosen].minHotels ? chosen : suggested;
  // The Hostal plan has no SLA: its card keeps the included support.
  const slaFor = (id: PlanId) => (sla && PLANS[id].slaAvailable ? sla : null);
  const priceOf = (id: PlanId) =>
    quote({
      plan: id,
      rooms,
      hotels: Math.max(hotels, PLANS[id].minHotels),
      addons: id === "starter" ? addons : [],
      sla: slaFor(id),
      annual,
    });
  const toggleAddon = (id: AddonId, on: boolean) =>
    setAddons((a) => (on ? [...a, id] : a.filter((x) => x !== id)));
  const q = priceOf(plan);
  const p = PLANS[plan];
  const planSla = slaFor(plan);

  return (
    <Layout page="pricing">
      <section className="lamp relative overflow-hidden bg-night text-navy-foreground">
        <HeroPhoto />
        <div className="relative mx-auto max-w-7xl px-4 pt-16 pb-28 sm:px-6 lg:px-8">
          <div className="rise">
            <Marker n="Precios" onNight>
              En euros, sin IVA
            </Marker>
          </div>
          <h1 className="font-display rise mt-5 max-w-3xl text-[2.9rem] text-balance text-navy-strong [--d:80ms] sm:text-[4rem]">
            Un precio por habitación, <em className="text-brass">publicado</em> y sin letra pequeña
          </h1>
          <p className="rise mt-5 max-w-2xl text-lg text-navy-foreground/75 [--d:160ms]">
            Sin comisiones por reserva, sin permanencia y con el nivel de soporte que tu hotel
            necesite.
          </p>
        </div>
      </section>

      {/* Controls */}
      <section className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="surface-lift -mt-14 grid gap-6 rounded-2xl p-5 sm:p-6 md:grid-cols-[1.5fr_auto_1.2fr_auto] md:items-end">
          <div className="space-y-2">
            <label htmlFor="rooms" className="text-sm font-medium">
              Habitaciones en total
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={300}
                value={rooms}
                onChange={(e) => setRooms(clampInt(e.target.value, 1, 300))}
                className="w-full accent-[var(--brass-deep)]"
                aria-label="Habitaciones"
              />
              <input
                id="rooms"
                type="number"
                min={1}
                max={5000}
                value={rooms}
                onChange={(e) => setRooms(clampInt(e.target.value, 1, 5000))}
                className={`${FIELD} w-24`}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="hotels" className="text-sm font-medium">
              Hoteles
            </label>
            <input
              id="hotels"
              type="number"
              min={1}
              max={200}
              value={hotels}
              onChange={(e) => setHotels(clampInt(e.target.value, 1, 200))}
              className={`${FIELD} block w-24`}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="sla" className="text-sm font-medium">
              SLA
            </label>
            <select
              id="sla"
              value={sla}
              onChange={(e) => setSla(e.target.value as SlaId | "")}
              className={`${FIELD} block w-full`}
            >
              <option value="">Sin SLA (soporte incluido)</option>
              {SLA_IDS.map((id) => (
                <option key={id} value={id}>
                  {SLA_TIERS[id].name} · respuesta crítica en {SLA_TIERS[id].response.critical}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={annual}
            onClick={() => setAnnual((a) => !a)}
            className="flex h-10 items-center gap-3 rounded-lg bg-muted px-3 text-left text-sm"
          >
            <span
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${annual ? "bg-night" : "bg-input"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-card shadow transition-transform duration-200 ${annual ? "translate-x-4" : ""}`}
              />
            </span>
            <span className="whitespace-nowrap">
              Pago anual{" "}
              <span className="font-semibold text-brass-deep">−{ANNUAL_DISCOUNT * 100} %</span>
            </span>
          </button>
        </div>
      </section>

      {/* Plans + bill */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_24rem] lg:items-start xl:gap-12">
          <div role="radiogroup" aria-label="Plan" className="grid gap-4 sm:grid-cols-2">
            {PLAN_IDS.map((id) => {
              const pl = PLANS[id];
              const pq = priceOf(id);
              const list = listPrice(id, { sla: sla || null, annual });
              const idSla = slaFor(id);
              const on = id === plan;
              const needsHotels = hotels < pl.minHotels;
              return (
                <div
                  key={id}
                  data-spotlight
                  className={`glow relative flex flex-col rounded-2xl border p-6 ${
                    on
                      ? "border-transparent bg-night text-navy-foreground shadow-[var(--shadow-night)]"
                      : "surface"
                  }`}
                >
                  {id === suggested && (
                    <span className="font-figure absolute top-5 right-5 rounded-full bg-brass px-2.5 py-0.5 text-[0.7rem] text-night">
                      El que te conviene
                    </span>
                  )}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={needsHotels}
                    onClick={() => setChosen(id)}
                    className="text-left after:absolute after:inset-0 after:rounded-2xl disabled:cursor-not-allowed"
                  >
                    <span className={`block text-lg font-semibold ${on ? "text-navy-strong" : ""}`}>
                      {pl.name}
                    </span>
                  </button>
                  <p
                    className={`mt-1 min-h-10 text-sm ${on ? "text-navy-foreground/70" : "text-stone"}`}
                  >
                    {pl.tagline}
                  </p>
                  <p className="mt-5 flex items-baseline gap-1.5">
                    <span
                      className={`text-[2.6rem] leading-none font-semibold tracking-[-0.03em] tabular-nums ${on ? "text-navy-strong" : ""}`}
                    >
                      {eur2(list.perRoom)}
                    </span>
                    <span className={`text-sm ${on ? "text-navy-foreground/60" : "text-stone"}`}>
                      / habitación y mes
                    </span>
                  </p>
                  <p
                    className={`font-figure mt-1 text-xs ${on ? "text-navy-foreground/55" : "text-stone"}`}
                  >
                    Mínimo {eur2(list.minimum)}/mes
                    {pl.minHotels > 1 ? ` · desde ${pl.minHotels} hoteles` : ""}
                  </p>
                  <p className={`mt-4 text-sm ${on ? "text-navy-strong" : ""}`}>
                    {needsHotels ? (
                      <span className={on ? "text-navy-foreground/60" : "text-stone"}>
                        Para grupos de 2 hoteles o más.
                      </span>
                    ) : (
                      <>
                        Para {rooms} hab.:{" "}
                        <span className="font-figure font-semibold">
                          {eur(pq.effectiveMonthly, 2)}/mes
                        </span>
                      </>
                    )}
                  </p>
                  <ul className="mt-5 flex-1 space-y-2 text-sm">
                    {pl.highlights.map((h) => (
                      <li key={h} className="flex gap-2">
                        <Tick className={`mt-0.5 ${on ? "!text-[oklch(0.78_0.08_168)]" : ""}`} />{" "}
                        {h}
                      </li>
                    ))}
                    <li className={`flex gap-2 ${on ? "text-navy-foreground/70" : "text-stone"}`}>
                      <span className="mt-2 h-px w-3 shrink-0 bg-current" aria-hidden="true" />
                      {idSla
                        ? `SLA ${SLA_TIERS[idSla].name}: respuesta crítica en ${SLA_TIERS[idSla].response.critical}, disponibilidad ${pct(SLA_TIERS[idSla].uptime)}`
                        : pl.slaAvailable
                          ? `Soporte incluido: ${BASE_SUPPORT.channels.toLowerCase()}. SLA opcional`
                          : `Soporte incluido: ${BASE_SUPPORT.channels.toLowerCase()}. Sin SLA en este plan`}
                    </li>
                  </ul>
                  <p className={`mt-5 text-xs ${on ? "text-navy-foreground/55" : "text-stone"}`}>
                    Implantación:{" "}
                    <span className={on ? "text-navy-strong" : "text-foreground"}>
                      {pq.onboarding
                        ? `${id === "group" ? "desde " : ""}${eur(pq.onboarding)}`
                        : "gratis con el pago anual"}
                    </span>
                    {pq.onboarding > 0 && pl.onboardingFreeAnnual && " (gratis con el pago anual)"}.{" "}
                    {pl.onboardingNote}
                  </p>
                </div>
              );
            })}
          </div>

          {/* The bill */}
          <aside className="lg:sticky lg:top-24" aria-label={`Cuenta del plan ${p.name}`}>
            <div className="surface-lift rounded-2xl px-6 pt-6 pb-5">
              <div className="flex items-baseline justify-between border-b border-dashed pb-4">
                <p className="font-display text-2xl">La cuenta</p>
                <p className="font-figure text-xs text-stone">
                  {p.name} · {rooms} hab.{hotels > 1 ? ` · ${hotels} hoteles` : ""}
                </p>
              </div>
              <dl className="font-figure divide-y divide-dashed text-sm">
                {q.lines.map((l) => (
                  <BillLine key={l.label} label={l.label} value={eur(l.amount, 2)} />
                ))}
                {PACKAGE_IDS.filter((id) => PLAN_PACKAGES[plan].includes(id)).map((id) => (
                  <BillLine
                    key={id}
                    label={`Paquete ${PACKAGES[id].name}`}
                    value="incluido"
                    tone="mineral"
                  />
                ))}
                {!planSla && (
                  <BillLine
                    label="SLA"
                    value={p.slaAvailable ? "sin SLA" : "no disponible"}
                    tone="muted"
                  />
                )}
                {q.discount > 0 && (
                  <BillLine
                    label={`Pago anual −${q.discount * 100} %`}
                    value={`−${eur(q.monthly - q.effectiveMonthly, 2)}`}
                    tone="mineral"
                  />
                )}
              </dl>
              <div className="mt-2 flex items-end justify-between border-t-2 border-foreground/80 pt-4">
                <span className="text-sm">Total al mes</span>
                <span className="font-figure text-3xl font-semibold">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <m.span
                      key={q.effectiveMonthly}
                      className="inline-block"
                      initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
                      transition={{ type: "spring", stiffness: 300, damping: 28 }}
                    >
                      {eur(q.effectiveMonthly, 2)}
                    </m.span>
                  </AnimatePresence>
                </span>
              </div>
              {annual && (
                <p className="font-figure mt-1 text-right text-xs text-stone">
                  {eur(q.yearly, 2)} al año
                </p>
              )}
              <p className="mt-3 text-xs text-stone">
                Sin IVA. Implantación{" "}
                {q.onboarding
                  ? `${plan === "group" ? "desde " : ""}${eur(q.onboarding)}`
                  : "gratis con el pago anual"}
                .
              </p>

              {plan === "starter" && (
                <fieldset className="mt-5 space-y-2.5 border-t border-dashed pt-4">
                  <legend className="sr-only">Paquetes opcionales</legend>
                  <p className="text-xs font-semibold text-stone">Añade paquetes a Esencial</p>
                  {ADDON_IDS.map((a) => {
                    const list = listPrice("starter", { sla: sla || null, annual });
                    return (
                      <label key={a} className="flex cursor-pointer items-center gap-2.5 text-sm">
                        <input
                          type="checkbox"
                          checked={addons.includes(a)}
                          onChange={(e) => toggleAddon(a, e.target.checked)}
                          className="h-4 w-4 accent-[var(--brass-deep)]"
                        />
                        <span className="flex-1">{PACKAGES[a].name}</span>
                        <span className="font-figure text-xs text-stone">
                          +{eur2(list.addonPerRoom(a))}/hab.
                        </span>
                      </label>
                    );
                  })}
                  {suggested === "pro" && addons.length > 0 && (
                    <p className="text-xs text-brass-deep">
                      Con esos paquetes, Profesional te sale igual o más barato y lo incluye todo.
                    </p>
                  )}
                </fieldset>
              )}

              <a
                href={`${PAGES.demo}?${new URLSearchParams({ plan, rooms: String(rooms), hotels: String(Math.max(hotels, p.minHotels)) })}`}
                className="btn btn-night lean mt-6 w-full"
              >
                Agendar demo con este plan <ArrowRight aria-hidden="true" />
              </a>
            </div>
            {chosen === null && (
              <p className="mt-3 text-center text-xs text-stone">
                Te mostramos el plan que más te conviene. Toca otro para ver su cuenta.
              </p>
            )}
          </aside>
        </div>

        <div
          className="mt-10 flex flex-col gap-3 rounded-2xl border border-brass/40 bg-[linear-gradient(135deg,oklch(0.96_0.03_82),var(--card))] p-5 sm:flex-row sm:items-center"
          data-reveal
        >
          <Sparkles className="h-5 w-5 shrink-0 text-brass-deep" aria-hidden="true" />
          <p className="text-sm">
            <span className="font-semibold">Hoteles fundadores:</span> los {FOUNDERS.seats} primeros
            hoteles que paguen el año por adelantado tienen un {FOUNDERS.annualDiscount * 100} % de
            descuento (en lugar del {ANNUAL_DISCOUNT * 100} %), a cambio de sus comentarios y, si el
            resultado es bueno, un caso de éxito. Pregúntalo en la demo.
          </p>
        </div>
      </section>

      {/* Always */}
      <section className="border-y border-border/70 bg-card">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <SectionHead n="01" label="Siempre" title="En todos los planes" />
          <ul className="grid gap-4 self-end sm:grid-cols-2" data-reveal>
            {ALWAYS.map((a) => (
              <li key={a} className="flex gap-2.5 text-sm">
                <Tick className="mt-0.5" /> {a}
              </li>
            ))}
            <li className="flex gap-2.5 text-sm">
              <Tick className="mt-0.5" />
              IA: {AI_CONVERSATIONS_INCLUDED.toLocaleString("es-ES")} conversaciones al mes por
              hotel incluidas; después, {eur(AI_EXTRA_CONVERSATION, 2)} por conversación
            </li>
          </ul>
        </div>
      </section>

      {/* Modules by plan */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionHead n="02" label="Módulos" title="Qué incluye cada plan" />
        <div className="surface mt-10 overflow-x-auto rounded-2xl" data-reveal>
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b bg-muted/70 text-left">
                <th className="px-5 py-3.5 font-medium">Módulo</th>
                {PLAN_IDS.map((id) => (
                  <th key={id} className="px-4 py-3.5 text-center font-medium">
                    {PLANS[id].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PACKAGE_IDS.map((pkg) => (
                <PackageRows key={pkg} pkg={pkg} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-stone">
          «Opcional»: paquete que se añade a Esencial con el precio indicado en la cuenta.
        </p>
      </section>

      {/* SLA */}
      <section className="border-t border-border/70 bg-card" id="sla">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHead
            n="03"
            label="Acuerdo de nivel de servicio"
            title="Paga la urgencia que necesitas, por escrito"
            lead="Todos los planes incluyen soporte en horario laboral. Si tu hotel no puede esperar, contrata un SLA (planes Esencial, Profesional y Grupo): compromisos de respuesta y disponibilidad en el contrato, compensados en la factura si no los cumplimos. Se cobra como un porcentaje de tu cuota, con un mínimo, y puedes cambiarlo cada mes."
          />
          <div className="surface mt-10 overflow-x-auto rounded-2xl" data-reveal>
            <table className="w-full min-w-[48rem] text-sm">
              <thead>
                <tr className="border-b bg-muted/70 text-left align-top">
                  <th className="px-5 py-3.5 font-medium" />
                  <th className="px-4 py-3.5 font-medium">
                    Incluido
                    <span className="block text-xs font-normal text-stone">
                      En todos los planes
                    </span>
                  </th>
                  {SLA_IDS.map((id) => (
                    <th key={id} className="px-4 py-3.5 font-medium">
                      {SLA_TIERS[id].name}
                      <span className="font-figure block text-xs font-normal text-stone">
                        +{SLA_TIERS[id].share * 100} % · mín. {eur(SLA_TIERS[id].minimum)}/mes
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&_td]:px-4 [&_td]:py-3.5 [&_td]:align-top [&_td:first-child]:pl-5 [&_tr]:border-b [&_tr:last-child]:border-0">
                <SlaRow
                  label="Disponibilidad mensual"
                  base="Sin compromiso"
                  cell={(id) => (
                    <>
                      <span className="font-figure font-semibold">{pct(SLA_TIERS[id].uptime)}</span>
                      <span className="block text-xs text-stone">
                        máx. {downtimeMinutes(SLA_TIERS[id].uptime)} min sin servicio al mes
                      </span>
                    </>
                  )}
                />
                <SlaRow
                  label="Soporte"
                  base={BASE_SUPPORT.channels}
                  cell={(id) => SLA_TIERS[id].support}
                />
                <SlaRow
                  label="Respuesta: crítica"
                  hint="No se puede reservar, hacer check-in o cobrar"
                  base="Lo antes posible en horario laboral"
                  cell={(id) => SLA_TIERS[id].response.critical}
                />
                <SlaRow
                  label="Respuesta: alta"
                  hint="Una función importante falla, hay alternativa"
                  base={BASE_SUPPORT.response.replace("Respuesta en ", "")}
                  cell={(id) => SLA_TIERS[id].response.high}
                />
                <SlaRow
                  label="Respuesta: normal"
                  hint="Dudas y peticiones"
                  base={BASE_SUPPORT.response.replace("Respuesta en ", "")}
                  cell={(id) => SLA_TIERS[id].response.normal}
                />
                <SlaRow
                  label="Pérdida máxima de datos (RPO)"
                  base="Copia diaria, sin compromiso"
                  cell={(id) => SLA_TIERS[id].rpo}
                />
                <SlaRow
                  label="Tiempo de recuperación (RTO)"
                  base="Sin compromiso"
                  cell={(id) => SLA_TIERS[id].rto}
                />
                <SlaRow
                  label="Compensación si fallamos"
                  base={<Minus className="h-4 w-4 text-stone" aria-label="No" />}
                  cell={() => (
                    <>
                      <Tick />
                      <span className="sr-only">Sí</span>
                    </>
                  )}
                />
              </tbody>
            </table>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="surface glow rounded-2xl p-6 text-sm" data-reveal>
              <p className="font-semibold">Compensación si no cumplimos</p>
              <ul className="font-figure mt-3 space-y-1.5 text-stone">
                <li>Por debajo del compromiso: 10 % de la cuota del mes</li>
                <li>Por debajo del 99 %: 25 %</li>
                <li>Por debajo del 98 %: 50 %</li>
              </ul>
              <p className="mt-3 text-stone">
                Se descuenta sola de la siguiente factura, sin que tengas que reclamarla.
              </p>
            </div>
            <div
              className="surface glow rounded-2xl p-6 text-sm"
              data-reveal
              style={{ ["--d" as string]: "120ms" }}
            >
              <p className="font-semibold">Qué no cuenta como caída</p>
              <ul className="mt-3 space-y-1.5 text-stone">
                <li>
                  Mantenimiento avisado con 48 h, entre las 2:00 y las 6:00 y como máximo 4 h al mes
                </li>
                <li>Fallos de servicios de terceros: pasarelas de pago, OTAs, proveedores de IA</li>
                <li>Problemas de la conexión o los equipos del hotel</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <SectionHead n="04" label="Dudas" title="Preguntas frecuentes" />
        <div className="surface mt-10 divide-y rounded-2xl" data-reveal>
          {FAQ.map((f) => (
            <details key={f.q} className="group px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium marker:hidden">
                {f.q}
                <span
                  aria-hidden="true"
                  className="text-xl leading-none text-stone transition-transform duration-200 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-stone">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-12 text-center">
          <a href={PAGES.demo} className="btn btn-night lean">
            Resolver dudas en una demo <ArrowRight aria-hidden="true" />
          </a>
        </div>
      </section>
    </Layout>
  );
}

function BillLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "mineral" | "muted";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className={tone === "muted" ? "text-stone" : ""}>{label}</dt>
      <dd
        className={
          tone === "mineral" ? "text-mineral" : tone === "muted" ? "text-stone" : "font-semibold"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function PackageRows({ pkg }: { pkg: PackageId }) {
  const features = PACKAGES[pkg].modules;
  const status = (plan: PlanId) =>
    PLAN_PACKAGES[plan].includes(pkg)
      ? "yes"
      : plan === "starter" && pkg in ADDONS
        ? "optional"
        : "no";
  return (
    <>
      <tr className="border-b bg-sand/50">
        <td colSpan={PLAN_IDS.length + 1} className="font-figure px-5 py-2 text-xs text-brass-deep">
          {PACKAGES[pkg].name}
        </td>
      </tr>
      {features.map((f) => (
        <tr key={f} className="border-b last:border-0">
          <td className="px-5 py-3">{f}</td>
          {PLAN_IDS.map((plan) => {
            const s = status(plan);
            return (
              <td key={plan} className="px-4 py-3 text-center">
                {s === "yes" ? (
                  <>
                    <Tick className="mx-auto" />
                    <span className="sr-only">Incluido</span>
                  </>
                ) : s === "optional" ? (
                  <span className="font-figure text-xs text-brass-deep">Opcional</span>
                ) : (
                  <Minus className="mx-auto h-4 w-4 text-stone/50" aria-label="No incluido" />
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function SlaRow({
  label,
  hint,
  base,
  cell,
}: {
  label: string;
  hint?: string;
  /** What the support included in every plan offers. */
  base: ReactNode;
  cell: (id: SlaId) => ReactNode;
}) {
  return (
    <tr>
      <td className="font-medium">
        {label}
        {hint && <span className="block text-xs font-normal text-stone">{hint}</span>}
      </td>
      <td className="text-stone">{base}</td>
      {SLA_IDS.map((id) => (
        <td key={id}>{cell(id)}</td>
      ))}
    </tr>
  );
}
