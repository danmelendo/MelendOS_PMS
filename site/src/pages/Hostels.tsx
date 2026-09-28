import { ArrowRight } from "lucide-react";
import { Layout } from "../components/Layout";
import { HeroPhoto } from "../components/HeroPhoto";
import { ComplianceLedger } from "../components/Compliance";
import { DemoAgenda } from "../components/DemoAgenda";
import { PanelMock, WebMock } from "../components/Mockups";
import { Marker, SectionHead, Tick } from "../components/ui";
import { PAGES } from "../config";
import { ANNUAL_DISCOUNT, PLANS, quote } from "../../supabase/functions/_shared/plans.ts";

const eur2 = (n: number) =>
  n.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: n % 1 ? 2 : 0,
  });
const eur = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const PAINS = [
  {
    pain: "¿Aún con la libreta o el Excel?",
    answer:
      "Calendario de habitaciones, reservas y cobros en una pantalla, desde el ordenador o el móvil.",
  },
  {
    pain: "¿Las OTAs se quedan un 15-20 % de cada reserva?",
    answer:
      "Tu propia web de reserva directa, con pago online o en recepción. Sin comisión por reserva.",
  },
  {
    pain: "¿Los partes de viajeros te quitan tiempo?",
    answer:
      "El huésped deja sus datos y firma antes de llegar, y el parte se envía solo a SES.HOSPEDAJES.",
  },
  {
    pain: "¿Los grandes PMS te atan con contratos y presupuestos?",
    answer:
      "Precio publicado, pago mensual sin permanencia y tus datos exportables cuando quieras.",
  },
];

export function HostelsPage() {
  const plan = PLANS.hostal;
  const example = quote({ plan: "hostal", rooms: 10 });
  const yearly = quote({ plan: "hostal", rooms: 10, annual: true });
  return (
    <Layout page="hostels">
      <section className="lamp relative overflow-hidden bg-night text-navy-foreground">
        <HeroPhoto />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pt-14 pb-24 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8 lg:pt-20 lg:pb-28">
          <div>
            <div className="rise">
              <Marker n="Hostales" onNight>
                Y pensiones
              </Marker>
            </div>
            <h1 className="font-display rise mt-6 text-[3rem] text-balance text-navy-strong [--d:80ms] sm:text-[4.2rem]">
              El programa de gestión para tu hostal,{" "}
              <em className="text-brass">sin atarte a nadie.</em>
            </h1>
            <p className="rise mt-6 max-w-lg text-lg leading-relaxed text-navy-foreground/75 [--d:180ms]">
              Calendario, reservas, web de reserva directa y registro de viajeros desde{" "}
              {eur(plan.minimum)} al mes. Sin permanencia, sin comisiones y con tus datos siempre
              tuyos.
            </p>
            <div className="rise mt-9 flex flex-wrap gap-3 [--d:280ms]">
              <a href={`${PAGES.demo}?plan=hostal`} className="btn btn-brass lean">
                Pide una demo de 30 min <ArrowRight aria-hidden="true" />
              </a>
              <a href={PAGES.pricing} className="btn btn-quiet text-navy-strong">
                Ver precios
              </a>
            </div>
          </div>
          <div className="relative lg:pb-16">
            <div className="drift-in [--d:150ms]">
              <PanelMock />
            </div>
            <div className="drift-in absolute -bottom-6 -left-10 hidden w-[62%] [--d:700ms] [--from-x:-18px] lg:block">
              <WebMock />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 lg:py-28">
        <SectionHead
          n="01"
          label="Lo que resuelve"
          title="Lo que de verdad necesita un hostal, sin pagar por lo que no usa"
        />
        <ol className="mt-12 divide-y border-y">
          {PAINS.map((p, i) => (
            <li
              key={p.pain}
              data-reveal
              style={{ ["--d" as string]: `${i * 90}ms` }}
              className="glow-row -mx-4 grid gap-3 rounded-xl px-4 py-8 md:grid-cols-[4rem_1fr_1fr] md:gap-8"
            >
              <span className="font-figure text-sm text-brass-deep">0{i + 1}</span>
              <p className="font-display text-[1.75rem] leading-tight">{p.pain}</p>
              <p className="self-center leading-relaxed text-stone">{p.answer}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-border/70 bg-[linear-gradient(180deg,var(--sand),var(--ivory))]">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_26rem] lg:gap-20 lg:px-8">
          <div>
            <SectionHead
              n="02"
              label={`Plan ${plan.name}`}
              title={`${eur(plan.perRoom)} por habitación al mes, mínimo ${eur(plan.minimum)}`}
              lead={`Un hostal de 10 habitaciones paga ${eur(example.monthly)} al mes. Implantación ${eur(plan.onboarding)}, gratis si pagas el año por adelantado (−${ANNUAL_DISCOUNT * 100} %). Precios sin IVA.`}
            />
            <ul className="mt-8 space-y-2.5" data-reveal>
              {plan.highlights.map((h) => (
                <li key={h} className="flex gap-2.5">
                  <Tick className="mt-1" /> {h}
                </li>
              ))}
              <li className="flex gap-2.5 text-stone">
                <span className="mt-3 h-px w-3 shrink-0 bg-current" aria-hidden="true" />
                ¿Quieres chat con recepción, cuenta de la estancia o reseñas? Pasa a Esencial cuando
                quieras.
              </li>
            </ul>
            <div className="mt-9 flex flex-wrap gap-3" data-reveal>
              <a href={`${PAGES.demo}?plan=hostal&rooms=10`} className="btn btn-night lean">
                Agendar demo <ArrowRight aria-hidden="true" />
              </a>
              <a href={PAGES.pricing} className="btn btn-quiet">
                Comparar planes
              </a>
            </div>
          </div>
          <div className="relative" data-reveal="scale">
            <div
              aria-hidden="true"
              className="absolute inset-x-6 -bottom-3 h-full rounded-2xl bg-sand"
              style={{ transform: "rotate(1.4deg)" }}
            />
            <div className="surface-lift glow relative rounded-2xl px-6 pt-6 pb-5">
              <div className="flex items-baseline justify-between border-b border-dashed pb-4">
                <p className="font-display text-2xl">La cuenta</p>
                <p className="font-figure text-xs text-stone">Hostal · 10 hab.</p>
              </div>
              <dl className="font-figure divide-y divide-dashed text-sm">
                {[
                  ["Pago mensual", `${eur2(example.monthly)}/mes`, true],
                  ["Implantación (pago mensual)", eur2(example.onboarding), false],
                  ["Pago anual", `${eur2(yearly.yearly)}/año`, true],
                  ["Implantación (pago anual)", eur2(yearly.onboarding), false],
                  ["Comisión por reserva", "0 %", false],
                ].map(([k, v, strong]) => (
                  <div key={k as string} className="flex justify-between gap-4 py-2.5">
                    <dt className="text-stone">{k}</dt>
                    <dd className={strong ? "font-semibold" : ""}>{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-stone">
                Precios sin IVA. Sin permanencia en el pago mensual.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:px-8">
        <div>
          <SectionHead
            n="03"
            label="Normativa"
            title="Al día con el registro de viajeros y la facturación"
            lead="Sin coste aparte en ningún plan."
          />
          <a
            href={PAGES.compliance}
            className="link-draw lean mt-8 inline-flex items-center gap-1.5 text-sm font-semibold"
            data-reveal
          >
            Qué exige cada obligación y desde cuándo{" "}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
        <div data-reveal="scale">
          <ComplianceLedger />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8" data-reveal="scale">
        <DemoAgenda />
      </section>
    </Layout>
  );
}
