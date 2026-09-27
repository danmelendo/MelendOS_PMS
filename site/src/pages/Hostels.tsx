import type { ComponentType } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  Check,
  FileWarning,
  Lock,
  Percent,
} from "lucide-react";
import { Layout } from "../components/Layout";
import { ComplianceList } from "../components/Compliance";
import { PanelMock } from "../components/Mockups";
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

const PAINS: {
  icon: ComponentType<{ className?: string }>;
  pain: string;
  answer: string;
}[] = [
  {
    icon: BookOpen,
    pain: "¿Aún con la libreta o el Excel?",
    answer:
      "Calendario de habitaciones, reservas y cobros en una pantalla, desde el ordenador o el móvil.",
  },
  {
    icon: Percent,
    pain: "¿Las OTAs se quedan un 15-20 % de cada reserva?",
    answer:
      "Tu propia web de reserva directa, con pago online o en recepción. Sin comisión por reserva.",
  },
  {
    icon: FileWarning,
    pain: "¿Los partes de viajeros te quitan tiempo?",
    answer:
      "El huésped deja sus datos y firma antes de llegar. El envío automático a SES.HOSPEDAJES está en desarrollo.",
  },
  {
    icon: Lock,
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
      <section className="bg-navy text-navy-foreground">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1fr] lg:py-20">
          <div className="space-y-6">
            <p className="text-sm font-semibold text-navy-gold">Para hostales y pensiones</p>
            <h1 className="text-3xl font-semibold tracking-tight text-balance text-navy-strong sm:text-5xl sm:leading-[1.08]">
              El programa de gestión para tu hostal,{" "}
              <span className="text-navy-gold">sin atarte a nadie.</span>
            </h1>
            <p className="max-w-xl text-base text-navy-foreground/75 sm:text-lg">
              Calendario, reservas, web de reserva directa y registro de viajeros desde{" "}
              {eur(plan.minimum)} al mes. Sin permanencia, sin comisiones y con tus datos siempre
              tuyos.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={`${PAGES.demo}?plan=hostal`}
                className="inline-flex items-center gap-2 rounded-md bg-navy-gold px-5 py-2.5 text-sm font-semibold text-navy-gold-foreground shadow hover:bg-navy-gold/90"
              >
                <CalendarCheck className="h-4 w-4" aria-hidden="true" /> Pide una demo de 30 min
              </a>
              <a
                href={PAGES.pricing}
                className="inline-flex items-center gap-2 rounded-md border border-navy-border px-5 py-2.5 text-sm font-semibold text-navy-strong hover:bg-navy-accent"
              >
                Ver precios <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
          <PanelMock />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
          Lo que de verdad necesita un hostal, sin pagar por lo que no usa
        </h2>
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {PAINS.map((p) => (
            <li key={p.pain} className="flex gap-4 rounded-lg border bg-card p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                <p.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold">{p.pain}</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.answer}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-y bg-card">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="text-sm font-semibold text-gold-foreground">Plan {plan.name}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              {eur(plan.perRoom)} por habitación al mes, mínimo {eur(plan.minimum)}
            </h2>
            <p className="mt-2 text-muted-foreground">
              Un hostal de 10 habitaciones paga {eur(example.monthly)} al mes. Implantación{" "}
              {eur(plan.onboarding)}, gratis si pagas el año por adelantado (−
              {ANNUAL_DISCOUNT * 100} %). Precios sin IVA.
            </p>
            <ul className="mt-5 space-y-2">
              {plan.highlights.map((h) => (
                <li key={h} className="flex gap-2 text-sm">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-info-foreground"
                    aria-hidden="true"
                  />
                  {h}
                </li>
              ))}
              <li className="flex gap-2 text-sm">
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0 text-info-foreground"
                  aria-hidden="true"
                />
                ¿Quieres chat con recepción, cuenta de la estancia o reseñas? Pasa a Esencial cuando
                quieras.
              </li>
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={`${PAGES.demo}?plan=hostal&rooms=10`}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <CalendarCheck className="h-4 w-4" aria-hidden="true" /> Agendar demo
              </a>
              <a
                href={PAGES.pricing}
                className="inline-flex items-center gap-2 rounded-md border bg-background px-5 py-2.5 text-sm font-semibold hover:bg-accent"
              >
                Comparar planes
              </a>
            </div>
          </div>
          <div className="rounded-xl border bg-background p-6 shadow-sm">
            <p className="text-sm font-semibold">Ejemplo: hostal de 10 habitaciones</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Pago mensual</dt>
                <dd className="font-semibold tabular-nums">{eur2(example.monthly)}/mes</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Implantación (pago mensual)</dt>
                <dd className="tabular-nums">{eur2(example.onboarding)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t pt-3">
                <dt className="text-muted-foreground">Pago anual</dt>
                <dd className="font-semibold tabular-nums">{eur2(yearly.yearly)}/año</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Implantación (pago anual)</dt>
                <dd className="tabular-nums">{eur2(yearly.onboarding)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t pt-3">
                <dt className="text-muted-foreground">Comisión por reserva</dt>
                <dd className="tabular-nums">0 %</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              Precios sin IVA. Sin permanencia en el pago mensual.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="max-w-2xl space-y-3">
          <p className="text-sm font-semibold text-gold-foreground">Normativa</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Al día con el registro de viajeros y la facturación
          </h2>
          <p className="text-muted-foreground">
            Sin coste aparte en ningún plan.{" "}
            <a href={PAGES.compliance} className="font-medium text-info-foreground underline">
              Qué exige cada obligación y desde cuándo
            </a>
            .
          </p>
        </div>
        <div className="mt-8">
          <ComplianceList />
        </div>
      </section>
    </Layout>
  );
}
