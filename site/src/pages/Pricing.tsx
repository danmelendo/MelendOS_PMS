import { useState, type ReactNode } from "react";
import { CalendarCheck, Check, Minus, ShieldCheck, Sparkles } from "lucide-react";
import { Layout } from "../components/Layout";
import { PAGES } from "../config";
import {
  ADDON_IDS,
  ADDONS,
  AI_CONVERSATIONS_INCLUDED,
  AI_EXTRA_CONVERSATION,
  ALWAYS,
  ANNUAL_DISCOUNT,
  FOUNDERS,
  PACKAGE_IDS,
  PACKAGES,
  PLAN_IDS,
  PLAN_PACKAGES,
  PLANS,
  downtimeMinutes,
  quote,
  suggestPlan,
  type AddonId,
  type PackageId,
  type PlanId,
} from "../../supabase/functions/_shared/plans.ts";

const INPUT =
  "h-9 rounded-md border border-input bg-card px-3 text-sm tabular-nums shadow-sm focus-visible:outline-2 focus-visible:outline-ring";

const eur = (n: number, decimals = 0) =>
  n.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
const pct = (n: number) => `${n.toLocaleString("es-ES")} %`;
const clampInt = (v: string, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(Number(v) || min)));

const FAQ = [
  {
    q: "¿Qué cuenta como habitación?",
    a: "Cada habitación que se puede reservar y está activa. Las que das de baja por obras o temporada no cuentan ese mes.",
  },
  {
    q: "¿Cobráis comisión por reserva?",
    a: "No. Ni en la web, ni en la app, ni en el asistente. Solo pagas la cuota; la pasarela de pago cobra sus propias tarifas, que contratas tú.",
  },
  {
    q: "¿Qué pasa si me quiero ir?",
    a: "Te das de baja desde el mes siguiente y te llevas todos tus datos en formatos abiertos. Si pagaste un año por adelantado, te devolvemos los meses que no uses.",
  },
  {
    q: "¿Y si no cumplís el SLA?",
    a: "Te descontamos automáticamente de la siguiente factura el porcentaje que corresponda. Publicamos la disponibilidad de cada mes.",
  },
  {
    q: "¿Qué modelo de IA usa el asistente?",
    a: "El que mejor encaje con tu hotel y tu presupuesto; el sistema no depende de un proveedor. Tus datos no se usan para entrenar modelos de terceros.",
  },
  {
    q: "¿Puedo cambiar de plan?",
    a: "Sí, cuando quieras. Subir es inmediato y se prorratea; bajar se aplica desde el mes siguiente.",
  },
];

export function PricingPage() {
  const [rooms, setRooms] = useState(30);
  const [hotels, setHotels] = useState(1);
  const [annual, setAnnual] = useState(false);
  const [addons, setAddons] = useState<AddonId[]>([]);

  const suggested = suggestPlan(rooms, hotels, addons);
  const priceOf = (plan: PlanId) =>
    quote({
      plan,
      rooms,
      hotels: Math.max(hotels, PLANS[plan].minHotels),
      addons: plan === "starter" ? addons : [],
      annual,
    });
  const toggleAddon = (id: AddonId, on: boolean) =>
    setAddons((a) => (on ? [...a, id] : a.filter((x) => x !== id)));

  return (
    <Layout page="pricing">
      <section className="bg-navy text-navy-foreground">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <p className="text-sm font-semibold text-navy-gold">Precios</p>
          <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-balance text-navy-strong sm:text-4xl">
            Un precio por habitación, publicado y sin letra pequeña
          </h1>
          <p className="mt-3 max-w-2xl text-navy-foreground/75">
            Sin comisiones por reserva, sin permanencia y con un SLA que te compensa si fallamos.
            Precios en euros, sin IVA.
          </p>
        </div>
      </section>

      {/* Calculator */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="-mt-6 grid gap-6 rounded-xl border bg-card p-5 shadow-sm md:grid-cols-[1fr_1fr_auto] md:items-end">
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
                className="w-full accent-[var(--primary)]"
                aria-label="Habitaciones"
              />
              <input
                id="rooms"
                type="number"
                min={1}
                max={5000}
                value={rooms}
                onChange={(e) => setRooms(clampInt(e.target.value, 1, 5000))}
                className={`${INPUT} w-24`}
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
              className={`${INPUT} block w-24`}
            />
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={annual}
            onClick={() => setAnnual((a) => !a)}
            className="flex items-center gap-3 rounded-md bg-muted px-3 py-2 text-left text-sm"
          >
            <span
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${annual ? "bg-primary" : "bg-input"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-card shadow transition-transform ${annual ? "translate-x-4" : ""}`}
              />
            </span>
            <span>
              Pago anual{" "}
              <span className="font-semibold text-gold-foreground">−{ANNUAL_DISCOUNT * 100} %</span>
            </span>
          </button>
        </div>
      </section>

      {/* Plans */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-3">
          {PLAN_IDS.map((id) => {
            const plan = PLANS[id];
            const q = priceOf(id);
            const best = id === suggested;
            const needsHotels = hotels < plan.minHotels;
            return (
              <div
                key={id}
                className={`relative flex flex-col rounded-xl border bg-card p-6 ${
                  best ? "border-2 border-primary shadow-lg" : ""
                }`}
              >
                {best && (
                  <span className="absolute -top-3 left-6 rounded-full bg-navy-gold px-3 py-0.5 text-xs font-semibold text-navy-gold-foreground">
                    El que te conviene
                  </span>
                )}
                <p className="text-lg font-semibold">{plan.name}</p>
                <p className="mt-1 min-h-10 text-sm text-muted-foreground">{plan.tagline}</p>
                <p className="mt-5 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight tabular-nums">
                    {eur(plan.perRoom * (annual ? 1 - ANNUAL_DISCOUNT : 1), annual ? 2 : 0)}
                  </span>
                  <span className="text-sm text-muted-foreground">/ habitación y mes</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Mínimo {eur(plan.minimum)}/mes
                  {plan.minHotels > 1 ? ` · desde ${plan.minHotels} hoteles` : ""}
                </p>
                <div className="mt-4 rounded-md bg-muted px-3 py-2 text-sm">
                  {needsHotels ? (
                    <span className="text-muted-foreground">Para grupos de 2 hoteles o más.</span>
                  ) : (
                    <>
                      Para {rooms} hab.:{" "}
                      <span className="font-semibold tabular-nums">
                        {eur(q.effectiveMonthly, 2)}/mes
                      </span>
                      {annual && (
                        <span className="block text-xs text-muted-foreground">
                          {eur(q.yearly, 2)} al año
                        </span>
                      )}
                    </>
                  )}
                </div>
                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  {plan.highlights.map((h) => (
                    <li key={h} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-info-foreground" /> {h}
                    </li>
                  ))}
                  <li className="flex gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold-foreground" />
                    SLA {pct(plan.sla.uptime)} · respuesta crítica en {plan.sla.response.critical}
                  </li>
                </ul>
                {id === "starter" && (
                  <fieldset className="mt-5 space-y-2 border-t pt-4">
                    <legend className="sr-only">Paquetes opcionales</legend>
                    <p className="text-xs font-semibold text-muted-foreground">Añade si quieres</p>
                    {ADDON_IDS.map((a) => (
                      <label key={a} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={addons.includes(a)}
                          onChange={(e) => toggleAddon(a, e.target.checked)}
                          className="h-4 w-4 accent-[var(--primary)]"
                        />
                        <span className="flex-1">{PACKAGES[a].name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          +{eur(ADDONS[a]!.perRoom, ADDONS[a]!.perRoom % 1 ? 2 : 0)}/hab.
                        </span>
                      </label>
                    ))}
                  </fieldset>
                )}
                <p className="mt-5 text-xs text-muted-foreground">
                  Implantación:{" "}
                  <span className="font-medium text-foreground">
                    {plan.onboarding
                      ? `${id === "group" ? "desde " : ""}${eur(plan.onboarding)}`
                      : "gratis"}
                  </span>
                  . {plan.onboardingNote}
                </p>
                <a
                  href={`${PAGES.demo}?${new URLSearchParams({ plan: id, rooms: String(rooms), hotels: String(Math.max(hotels, plan.minHotels)) })}`}
                  className={`mt-5 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold ${
                    best
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border bg-background hover:bg-accent"
                  }`}
                >
                  <CalendarCheck className="h-4 w-4" /> Agendar demo
                </a>
              </div>
            );
          })}
        </div>
        {suggested === "pro" && addons.length > 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Con esos paquetes, Profesional te sale igual o más barato que Esencial y lo incluye
            todo.
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3 rounded-xl border border-gold/50 bg-gold/10 p-5 sm:flex-row sm:items-center">
          <Sparkles className="h-5 w-5 shrink-0 text-gold-foreground" />
          <p className="text-sm">
            <span className="font-semibold">Hoteles fundadores:</span> los {FOUNDERS.seats} primeros
            hoteles tienen un {FOUNDERS.discount * 100} % de descuento durante {FOUNDERS.months}{" "}
            meses a cambio de sus comentarios y, si el resultado es bueno, un caso de éxito.
            Pregúntalo en la demo.
          </p>
        </div>
      </section>

      {/* Always */}
      <section className="border-y bg-card">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6 md:grid-cols-[1fr_2fr]">
          <h2 className="text-2xl font-semibold tracking-tight">En todos los planes</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {ALWAYS.map((a) => (
              <li key={a} className="flex gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-info-foreground" /> {a}
              </li>
            ))}
            <li className="flex gap-2 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-info-foreground" />
              IA: {AI_CONVERSATIONS_INCLUDED.toLocaleString("es-ES")} conversaciones al mes por
              hotel incluidas; después, {eur(AI_EXTRA_CONVERSATION, 2)} por conversación
            </li>
          </ul>
        </div>
      </section>

      {/* Modules by plan */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">Qué incluye cada plan</h2>
        <div className="mt-6 overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b bg-muted text-left">
                <th className="px-4 py-3 font-medium">Módulo</th>
                {PLAN_IDS.map((id) => (
                  <th key={id} className="px-4 py-3 text-center font-medium">
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
        <p className="mt-3 text-xs text-muted-foreground">
          «Opcional»: paquete que se añade a Esencial con el precio indicado arriba.
        </p>
      </section>

      {/* SLA */}
      <section className="border-t bg-card" id="sla">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-gold-foreground">
              Acuerdo de nivel de servicio
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Lo que te garantizamos, por escrito
            </h2>
            <p className="mt-2 text-muted-foreground">
              Somos un proveedor nuevo: por eso ponemos los compromisos en el contrato y los
              compensamos en la factura si no los cumplimos.
            </p>
          </div>
          <div className="mt-6 overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b bg-muted text-left">
                  <th className="px-4 py-3 font-medium" />
                  {PLAN_IDS.map((id) => (
                    <th key={id} className="px-4 py-3 font-medium">
                      {PLANS[id].name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&_td]:px-4 [&_td]:py-3 [&_td]:align-top [&_tr]:border-b">
                <SlaRow
                  label="Disponibilidad mensual"
                  cell={(id) => (
                    <>
                      <span className="font-semibold">{pct(PLANS[id].sla.uptime)}</span>
                      <span className="block text-xs text-muted-foreground">
                        máx. {downtimeMinutes(PLANS[id].sla.uptime)} min sin servicio al mes
                      </span>
                    </>
                  )}
                />
                <SlaRow label="Soporte" cell={(id) => PLANS[id].sla.support} />
                <SlaRow
                  label="Respuesta: crítica"
                  hint="No se puede reservar, hacer check-in o cobrar"
                  cell={(id) => PLANS[id].sla.response.critical}
                />
                <SlaRow
                  label="Respuesta: alta"
                  hint="Una función importante falla, hay alternativa"
                  cell={(id) => PLANS[id].sla.response.high}
                />
                <SlaRow
                  label="Respuesta: normal"
                  hint="Dudas y peticiones"
                  cell={(id) => PLANS[id].sla.response.normal}
                />
                <SlaRow label="Pérdida máxima de datos (RPO)" cell={(id) => PLANS[id].sla.rpo} />
                <SlaRow label="Tiempo de recuperación (RTO)" cell={(id) => PLANS[id].sla.rto} />
                <SlaRow
                  label="Además"
                  cell={(id) =>
                    PLANS[id].sla.extras.length ? (
                      <ul className="space-y-1">
                        {PLANS[id].sla.extras.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    ) : (
                      <Minus className="h-4 w-4 text-muted-foreground" />
                    )
                  }
                />
              </tbody>
            </table>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-background p-5 text-sm">
              <p className="font-semibold">Compensación si no cumplimos</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>Por debajo del compromiso: 10 % de la cuota del mes</li>
                <li>Por debajo del 99 %: 25 %</li>
                <li>Por debajo del 98 %: 50 %</li>
              </ul>
              <p className="mt-2 text-muted-foreground">
                Se descuenta sola de la siguiente factura, sin que tengas que reclamarla.
              </p>
            </div>
            <div className="rounded-lg border bg-background p-5 text-sm">
              <p className="font-semibold">Qué no cuenta como caída</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
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
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">Preguntas frecuentes</h2>
        <div className="mt-6 divide-y rounded-xl border bg-card">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className="cursor-pointer list-none font-medium marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {f.q}
                  <span className="text-muted-foreground transition-transform group-open:rotate-45">
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-10 text-center">
          <a
            href={PAGES.demo}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <CalendarCheck className="h-4 w-4" /> Resolver dudas en una demo
          </a>
        </div>
      </section>
    </Layout>
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
      <tr className="border-b bg-secondary/40">
        <td colSpan={4} className="px-4 py-2 text-xs font-semibold tracking-wide uppercase">
          {PACKAGES[pkg].name}
        </td>
      </tr>
      {features.map((f) => (
        <tr key={f} className="border-b last:border-0">
          <td className="px-4 py-2.5">{f}</td>
          {PLAN_IDS.map((plan) => {
            const s = status(plan);
            return (
              <td key={plan} className="px-4 py-2.5 text-center">
                {s === "yes" ? (
                  <Check className="mx-auto h-4 w-4 text-info-foreground" aria-label="Incluido" />
                ) : s === "optional" ? (
                  <span className="text-xs text-muted-foreground">Opcional</span>
                ) : (
                  <Minus
                    className="mx-auto h-4 w-4 text-muted-foreground"
                    aria-label="No incluido"
                  />
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
  cell,
}: {
  label: string;
  hint?: string;
  cell: (id: PlanId) => ReactNode;
}) {
  return (
    <tr>
      <td className="font-medium">
        {label}
        {hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}
      </td>
      {PLAN_IDS.map((id) => (
        <td key={id}>{cell(id)}</td>
      ))}
    </tr>
  );
}
