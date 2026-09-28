import { ArrowRight, Handshake, Plug } from "lucide-react";
import { Layout } from "../components/Layout";
import { HeroBoard } from "../components/HeroBoard";
import { StayStory } from "../components/StayStory";
import { ProductTour } from "../components/ProductTour";
import { AiLayer } from "../components/AiLayer";
import { PriceBill } from "../components/PriceBill";
import { DemoAgenda } from "../components/DemoAgenda";
import { ComplianceLedger } from "../components/Compliance";
import { Marker, SectionHead, Tick } from "../components/ui";
import { PAGES } from "../config";
import {
  ANNUAL_DISCOUNT,
  BASE_INCLUDES,
  FOUNDERS,
  PACKAGES,
  PLAN_IDS,
  PLAN_PACKAGES,
  PLANS,
  type PackageId,
} from "../../supabase/functions/_shared/plans.ts";

// The landing, told as a story: the product at work (hero), a day at the
// hotel, the parts of the system, what you pay for, the law, AI, the bill and
// the demo. Every claim comes from the catalogue (plans.ts) or the product.

const FACTS = [
  { value: `${PLANS.hostal.minimum} €`, label: "al mes, desde", note: "precio publicado" },
  { value: "0 %", label: "de comisión", note: "en cada reserva directa" },
  { value: "Mes a mes", label: "sin permanencia", note: "baja cuando quieras" },
  { value: "3/3", label: "obligaciones legales", note: "registro, SES y VeriFactu" },
];

// Floors of the building, top to bottom; the base is the ground floor.
const FLOORS: PackageId[] = ["chain", "distribution", "data", "ai", "stay"];
const FLOOR_WIDTH: Record<PackageId, string> = {
  chain: "lg:w-[58%]",
  distribution: "lg:w-[68%]",
  data: "lg:w-[76%]",
  ai: "lg:w-[86%]",
  stay: "lg:w-[94%]",
};

export function HomePage() {
  return (
    <Layout page="home">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="lamp relative overflow-hidden bg-night text-navy-foreground">
        <div aria-hidden="true" className="ledger-grid absolute inset-0" />
        <div className="relative mx-auto grid max-w-7xl gap-16 px-4 pt-14 pb-24 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-10 lg:px-8 lg:pt-20 lg:pb-32">
          <div>
            <div className="rise [--d:0ms]">
              <Marker n="Melend/OS" onNight>
                El sistema operativo para hoteles independientes
              </Marker>
            </div>
            <h1 className="font-display rise mt-6 text-[3.1rem] text-balance text-navy-strong [--d:80ms] sm:text-[4.4rem] xl:text-[5.1rem]">
              Tu hotel al día, sin depender de un <em className="text-brass">gran PMS.</em>
            </h1>
            <p className="rise mt-6 max-w-lg text-lg leading-relaxed text-navy-foreground/75 [--d:180ms]">
              Reservas, web sin comisiones, registro de viajeros, normativa y asistentes de IA en un
              solo programa. Desde {PLANS.hostal.minimum} € al mes, con precio publicado y sin
              permanencia.
            </p>
            <div className="rise mt-9 flex flex-wrap gap-3 [--d:280ms]">
              <a href={PAGES.demo} className="btn btn-brass lean">
                Agenda una demo de 30 min <ArrowRight aria-hidden="true" />
              </a>
              <a href={PAGES.pricing} className="btn btn-quiet text-navy-strong">
                Ver precios
              </a>
            </div>
          </div>
          <div className="px-2 sm:px-6 lg:px-0">
            <HeroBoard />
          </div>
        </div>

        {/* The ledger: four facts, set like the totals of a day */}
        <div className="relative border-t border-navy-border/80">
          <dl className="mx-auto grid max-w-7xl grid-cols-2 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
            {FACTS.map((f, i) => (
              <div
                key={f.label}
                className={`py-7 pr-4 ${i % 2 ? "pl-4 sm:pl-6" : ""} ${i > 0 ? "lg:border-l lg:border-navy-border/80 lg:pl-6" : ""} ${i >= 2 ? "border-t border-navy-border/80 lg:border-t-0" : ""}`}
              >
                <dt className="sr-only">{f.label}</dt>
                <dd>
                  <span className="font-figure block text-3xl text-navy-strong">{f.value}</span>
                  <span className="mt-1 block text-sm text-navy-foreground/80">{f.label}</span>
                  <span className="font-figure block text-xs text-navy-foreground/45">
                    {f.note}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── 01 A day at the hotel ────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
        <SectionHead
          n="01"
          label="La operación"
          title="Un día en el hotel, sin papeles ni teclear dos veces"
          lead="Del momento en que entra la reserva a la salida del huésped, cada paso lo lleva el sistema. Recepción atiende; el resto se hace solo."
        />
        <div className="mt-16">
          <StayStory />
        </div>
      </section>

      {/* ── 02 The system ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-y border-border/70 bg-[linear-gradient(180deg,var(--sand),var(--ivory))]">
        <div
          aria-hidden="true"
          className="ledger-grid-light absolute inset-0 opacity-60 [mask-image:linear-gradient(180deg,black,transparent_70%)]"
        />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
          <SectionHead
            n="02"
            label="El producto"
            title="Un solo sistema para recepción, la web, el huésped y la dirección"
          />
          <div className="mt-14">
            <ProductTour />
          </div>
        </div>
      </section>

      {/* ── 03 What you pay for: a building ───────────────────────────────── */}
      <section
        id="modulos"
        className="mx-auto max-w-7xl scroll-mt-20 px-4 py-24 sm:px-6 lg:px-8 lg:py-32"
      >
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHead
              n="03"
              label="Por módulos"
              title="Paga por lo que usas, no por un sistema enorme"
              lead="Una planta baja que todo hotel necesita y plantas que añades cuando te hacen falta, sin migraciones ni cambios de sistema."
            />
            <div className="mt-8 flex flex-wrap gap-2 text-xs" data-reveal>
              {PLAN_IDS.map((id) => (
                <span key={id} className="surface font-figure rounded-full px-3 py-1.5">
                  <span className="text-brass-deep">{PLANS[id].name[0]}</span> {PLANS[id].name}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {FLOORS.map((id, i) => (
              <div
                key={id}
                data-reveal
                data-spotlight
                style={{ ["--d" as string]: `${(FLOORS.length - i) * 70}ms` }}
                className={`surface w-full rounded-xl p-5 ${FLOOR_WIDTH[id]}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{PACKAGES[id].name}</p>
                  <PlanDots pkg={id} />
                </div>
                <p className="mt-1 text-sm text-stone">{PACKAGES[id].description}</p>
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {PACKAGES[id].modules.map((mod) => (
                    <li key={mod} className="flex items-center gap-1.5">
                      <Tick className="h-3.5 w-3.5" /> {mod}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {/* Ground floor */}
            <div
              data-reveal
              className="w-full rounded-xl bg-night p-6 text-navy-foreground shadow-[var(--shadow-night)]"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-lg font-semibold text-navy-strong">Base</p>
                <p className="font-figure text-xs text-brass">Planta baja · siempre incluida</p>
              </div>
              <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                {BASE_INCLUDES.map((b) => (
                  <li key={b} className="flex gap-2">
                    <Tick className="mt-0.5 !text-[oklch(0.78_0.08_168)]" /> {b}
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-3 self-start text-xs text-stone" data-reveal>
              Los puntos indican el plan que incluye cada planta. En Esencial, IA, Datos y
              Distribución se añaden sueltos.
            </p>
          </div>
        </div>
      </section>

      {/* ── 04 The law ───────────────────────────────────────────────────── */}
      <section className="border-y border-border/70 bg-card">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:px-8 lg:py-28">
          <div>
            <SectionHead
              n="04"
              label="Normativa"
              title="La normativa, resuelta por el propio sistema"
              lead="Registro de viajeros, partes a SES.HOSPEDAJES y facturas VeriFactu: incluidos en todos los planes, sin coste aparte."
            />
            <a
              href={PAGES.compliance}
              className="link-draw lean mt-8 inline-flex items-center gap-1.5 text-sm font-semibold"
              data-reveal
            >
              Qué exige cada obligación <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
          <div className="self-center" data-reveal="scale">
            <ComplianceLedger />
          </div>
        </div>
      </section>

      {/* ── 05 AI ────────────────────────────────────────────────────────── */}
      <section className="lamp relative overflow-hidden bg-night [--lamp-x:20%] [--lamp-y:0%]">
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
          <SectionHead
            n="05"
            label="Inteligencia artificial"
            onNight
            title={
              <>
                Una capa inteligente sobre tu hotel,{" "}
                <em className="text-brass">no un robot más.</em>
              </>
            }
            lead="Trabaja con los datos reales del hotel y dentro de sus reglas: lo que puede hacer lo decide el servidor, no el modelo."
          />
          <div className="mt-16">
            <AiLayer />
          </div>
        </div>
      </section>

      {/* ── 06 The bill ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
        <SectionHead
          n="06"
          label="Precio"
          title="Lo que pagas, línea a línea"
          lead="Un precio por habitación con un mínimo al mes. Los paquetes que tu plan incluye, los que puedes añadir y el SLA, siempre a la vista."
        />
        <div className="mt-14" data-reveal>
          <PriceBill />
        </div>

        <div className="mt-20 grid gap-4 md:grid-cols-[1.35fr_1fr]">
          <div
            data-reveal
            data-spotlight
            className="relative overflow-hidden rounded-2xl border border-brass/40 bg-[linear-gradient(135deg,oklch(0.96_0.03_82),var(--card))] p-7"
          >
            <Handshake className="h-5 w-5 text-brass-deep" aria-hidden="true" />
            <p className="font-display mt-4 text-[1.9rem] leading-tight">
              Programa de hoteles fundadores
            </p>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-stone">
              Los {FOUNDERS.seats} primeros hoteles que paguen el año por adelantado tienen un{" "}
              {FOUNDERS.annualDiscount * 100} % de descuento (en lugar del {ANNUAL_DISCOUNT * 100}{" "}
              %) a cambio de contarnos qué mejorar y de un caso de éxito si el resultado es bueno.
              Tu opinión decide el siguiente paso del producto.
            </p>
          </div>
          <div
            data-reveal
            data-spotlight
            style={{ ["--d" as string]: "120ms" }}
            className="surface rounded-2xl p-7"
          >
            <Plug className="h-5 w-5 text-stone" aria-hidden="true" />
            <p className="mt-4 text-lg font-semibold">Abierto a lo que ya usas</p>
            <p className="mt-2 text-sm leading-relaxed text-stone">
              Pasarela de pago a tu elección (Redsys, Stripe…), conexión con OTAs, channel managers
              y touroperadores, e integración con asistentes de IA. Los conectores concretos se
              acuerdan en la implantación.
            </p>
          </div>
        </div>
      </section>

      {/* ── Closing: the demo ────────────────────────────────────────────── */}
      <section
        className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8 lg:pb-32"
        data-reveal="scale"
      >
        <DemoAgenda />
      </section>
    </Layout>
  );
}

/** Which plans include a package: filled dot = included, ring = optional add-on. */
function PlanDots({ pkg }: { pkg: PackageId }) {
  return (
    <ul className="flex gap-1.5" aria-label="Planes que lo incluyen">
      {PLAN_IDS.map((id) => {
        const inc = PLAN_PACKAGES[id].includes(pkg);
        const opt = !inc && id === "starter" && pkg !== "chain" && pkg !== "stay";
        return (
          <li
            key={id}
            title={`${PLANS[id].name}: ${inc ? "incluido" : opt ? "opcional" : "no incluido"}`}
            className={`font-figure flex h-6 w-6 items-center justify-center rounded-full text-[0.65rem] ${
              inc
                ? "bg-night text-brass"
                : opt
                  ? "border border-dashed border-brass-deep/60 text-brass-deep"
                  : "border border-border text-stone/40"
            }`}
          >
            <span aria-hidden="true">{PLANS[id].name[0]}</span>
            <span className="sr-only">
              {PLANS[id].name}: {inc ? "incluido" : opt ? "opcional" : "no incluido"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
