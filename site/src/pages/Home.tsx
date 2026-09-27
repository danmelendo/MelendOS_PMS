import { useState, type ComponentType } from "react";
import {
  ArrowRight,
  BadgeEuro,
  CalendarCheck,
  Check,
  DatabaseZap,
  Scale,
  Handshake,
  MessageSquareText,
  MonitorPlay,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { Layout } from "../components/Layout";
import { ComplianceList } from "../components/Compliance";
import {
  AgentMock,
  CopilotMock,
  GuestAppMock,
  PanelMock,
  ReportsMock,
} from "../components/Mockups";
import { PAGES } from "../config";
import {
  BASE_INCLUDES,
  ANNUAL_DISCOUNT,
  FOUNDERS,
  PACKAGE_IDS,
  PACKAGES,
  PLANS,
  SLA_IDS,
  SLA_TIERS,
} from "../../supabase/functions/_shared/plans.ts";

const SHOWCASE: {
  id: string;
  label: string;
  title: string;
  points: string[];
  Mock: ComponentType;
}[] = [
  {
    id: "panel",
    label: "Recepción",
    title: "Todo el hotel en una pantalla",
    points: [
      "Planning de habitaciones por días con la limpieza entre estancias ya calculada",
      "«Hoy»: llegadas, salidas, alojados y ocupación, con check-in y cobro en un clic",
      "Reservas de la web, de las OTAs, de touroperadores y del asistente en el mismo sitio",
      "Roles de recepción, dirección y dirección de grupo; los datos sensibles, solo para dirección",
    ],
    Mock: PanelMock,
  },
  {
    id: "agent",
    label: "Asistente IA",
    title: "Un recepcionista que vende en tu web a cualquier hora",
    points: [
      "Busca disponibilidad, cotiza, reserva y envía el enlace de pago conversando",
      "Consulta y cancela reservas verificando al huésped, con las reglas de tu hotel",
      "No inventa precios: usa el mismo motor de reservas que la web",
      "Sin comisión por reserva: la venta es directa",
    ],
    Mock: AgentMock,
  },
  {
    id: "guest",
    label: "App del huésped",
    title: "La estancia, sin llamadas ni papeles",
    points: [
      "Check-in online con registro de viajeros y firma",
      "Chat con recepción: toallas, room service, late checkout…",
      "Cargos a la habitación, ampliación de la estancia y pago de la cuenta al salir",
      "Reseñas verificadas al terminar la estancia",
    ],
    Mock: GuestAppMock,
  },
  {
    id: "copilot",
    label: "Copiloto",
    title: "Pregunta por tu negocio como se lo preguntarías a tu director",
    points: [
      "«¿Qué habitaciones rinden menos entre semana?», «¿por qué cancelan?»",
      "Responde con los datos de tu hotel y enseña de dónde salen",
      "Solo lectura y con los permisos de quien pregunta",
    ],
    Mock: CopilotMock,
  },
  {
    id: "reports",
    label: "Informes",
    title: "Las cifras que mueven el hotel, sin hojas de cálculo",
    points: [
      "Ocupación, ADR, RevPAR, antelación, cancelaciones por motivo y canales",
      "Comparación con el año anterior y por hotel del grupo",
      "Exportación diaria de tus datos para análisis y modelos de predicción",
    ],
    Mock: ReportsMock,
  },
];

const TRUST: { icon: ComponentType<{ className?: string }>; title: string; text: string }[] = [
  {
    icon: BadgeEuro,
    title: "Precio publicado",
    text: "Sin presupuestos a ciegas: calcula lo que pagas antes de hablar con nadie.",
  },
  {
    icon: Undo2,
    title: "Sin ataduras",
    text: "Pago mensual sin permanencia y tus datos exportables cuando quieras. Irte es tan fácil como llegar.",
  },
  {
    icon: Scale,
    title: "Normativa al día",
    text: "Registro de viajeros incluido; SES.HOSPEDAJES y VeriFactu en camino, sin coste aparte.",
  },
  {
    icon: ShieldCheck,
    title: "SLA a tu medida",
    text: `Elige la urgencia que necesitas, hasta guardia 24/7 y un ${SLA_TIERS[SLA_IDS[SLA_IDS.length - 1]].uptime.toLocaleString("es-ES")} % de disponibilidad, con compensación si no la cumplimos.`,
  },
];

const DEMO_STEPS = [
  {
    icon: MessageSquareText,
    title: "Nos cuentas tu hotel",
    text: "Habitaciones, canales, cómo cobras y qué te quita tiempo hoy.",
  },
  {
    icon: MonitorPlay,
    title: "Lo ves funcionando",
    text: "Una reserva de principio a fin, la recepción de un día normal y el asistente de IA.",
  },
  {
    icon: BadgeEuro,
    title: "Te vas con un precio",
    text: "Plan, implantación y plazos para tu caso, por escrito y sin compromiso.",
  },
];

export function HomePage() {
  const [tab, setTab] = useState(SHOWCASE[0].id);
  const active = SHOWCASE.find((s) => s.id === tab) ?? SHOWCASE[0];

  return (
    <Layout page="home">
      {/* Hero */}
      <section className="bg-navy text-navy-foreground">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:py-20">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-navy-border px-3 py-1 text-xs text-navy-foreground/80">
              <span className="h-1.5 w-1.5 rounded-full bg-navy-gold" />
              PMS para hostales y hoteles independientes
            </span>
            <h1 className="text-3xl font-semibold tracking-tight text-balance text-navy-strong sm:text-5xl sm:leading-[1.08]">
              Tu hotel al día, sin depender de un <span className="text-navy-gold">gran PMS.</span>
            </h1>
            <p className="max-w-xl text-base text-navy-foreground/75 sm:text-lg">
              Reservas, web sin comisiones, registro de viajeros y asistentes de IA en un solo
              programa. Desde {PLANS.hostal.minimum} € al mes, con precio publicado y sin
              permanencia.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={PAGES.demo}
                className="inline-flex items-center gap-2 rounded-md bg-navy-gold px-5 py-2.5 text-sm font-semibold text-navy-gold-foreground shadow hover:bg-navy-gold/90"
              >
                <CalendarCheck className="h-4 w-4" aria-hidden="true" /> Agenda una demo de 30 min
              </a>
              <a
                href={PAGES.pricing}
                className="inline-flex items-center gap-2 rounded-md border border-navy-border px-5 py-2.5 text-sm font-semibold text-navy-strong hover:bg-navy-accent"
              >
                Ver precios <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-navy-foreground/70">
              {["0 % de comisión", "Sin permanencia", "Tus datos, siempre tuyos"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-navy-gold" aria-hidden="true" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <PanelMock />
        </div>
      </section>

      {/* What we offer instead of years of references */}
      <section className="border-b bg-card">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {TRUST.map((t) => (
            <div key={t.title} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                <t.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="font-semibold">{t.title}</p>
                <p className="text-sm text-muted-foreground">{t.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Compliance: the reason many hotels change system now */}
      <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm font-semibold text-gold-foreground">Normativa</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Ponte al día con SES.HOSPEDAJES y VeriFactu
            </h2>
            <p className="text-muted-foreground">
              Incluido en todos los planes, sin coste aparte. Te decimos qué ya funciona y qué
              estamos construyendo.
            </p>
          </div>
          <a
            href={PAGES.compliance}
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-info-foreground hover:underline"
          >
            Qué exige cada obligación <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
        <div className="mt-8">
          <ComplianceList />
        </div>
      </section>

      {/* Showcase */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="max-w-2xl space-y-3">
          <p className="text-sm font-semibold text-gold-foreground">El producto</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Un solo sistema para recepción, para el huésped y para la dirección
          </h2>
        </div>
        <div
          role="tablist"
          aria-label="Partes del producto"
          className="no-scrollbar mt-8 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1 sm:inline-flex"
        >
          {SHOWCASE.map((s) => (
            <button
              key={s.id}
              role="tab"
              type="button"
              id={`tab-${s.id}`}
              aria-selected={s.id === tab}
              aria-controls="showcase-panel"
              onClick={() => setTab(s.id)}
              className={`shrink-0 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                s.id === tab
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div
          id="showcase-panel"
          role="tabpanel"
          aria-labelledby={`tab-${active.id}`}
          key={active.id}
          className="swap-in mt-8 grid items-center gap-10 lg:grid-cols-[1fr_1.15fr]"
        >
          <div className="space-y-4">
            <h3 className="text-xl font-semibold tracking-tight">{active.title}</h3>
            <ul className="space-y-3">
              {active.points.map((p) => (
                <li key={p} className="flex gap-2.5 text-muted-foreground">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-info-foreground"
                    aria-hidden="true"
                  />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <active.Mock />
        </div>
      </section>

      {/* Packages */}
      <section id="modulos" className="scroll-mt-16 border-y bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm font-semibold text-gold-foreground">Por módulos</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Paga por lo que usas, no por un sistema enorme
            </h2>
            <p className="text-muted-foreground">
              Una base que todo hotel necesita y paquetes que activas cuando te hacen falta, sin
              migraciones ni cambios de sistema.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border-2 border-primary bg-background p-5">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Siempre incluido
              </p>
              <p className="mt-1 text-lg font-semibold">Base</p>
              <ul className="mt-3 space-y-2 text-sm">
                {BASE_INCLUDES.map((b) => (
                  <li key={b} className="flex gap-2">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-info-foreground"
                      aria-hidden="true"
                    />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            {PACKAGE_IDS.map((id) => (
              <div key={id} className="rounded-lg border bg-background p-5">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Paquete
                </p>
                <p className="mt-1 text-lg font-semibold">{PACKAGES[id].name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{PACKAGES[id].description}</p>
                <ul className="mt-3 space-y-2 text-sm">
                  {PACKAGES[id].modules.map((m) => (
                    <li key={m} className="flex gap-2">
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-info-foreground"
                        aria-hidden="true"
                      />
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What the demo call is */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="max-w-2xl space-y-3">
          <p className="text-sm font-semibold text-gold-foreground">La demo</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            30 minutos, por videollamada, pensando en tu hotel
          </h2>
        </div>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {DEMO_STEPS.map((s, i) => (
            <li key={s.title} className="rounded-lg border bg-card p-5">
              <span className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                  <s.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="text-xs font-semibold text-muted-foreground">Paso {i + 1}</span>
              </span>
              <p className="mt-3 font-semibold">{s.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Founders + integrations */}
      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:px-6 md:grid-cols-2">
        <div className="rounded-lg border border-gold/50 bg-gold/10 p-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-gold/25 text-gold-foreground">
            <Handshake className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="mt-3 text-lg font-semibold">Programa de hoteles fundadores</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Los {FOUNDERS.seats} primeros hoteles que paguen el año por adelantado tienen un{" "}
            {FOUNDERS.annualDiscount * 100} % de descuento (en lugar del {ANNUAL_DISCOUNT * 100} %)
            a cambio de contarnos qué mejorar y de un caso de éxito si el resultado es bueno. Tu
            opinión decide el siguiente paso del producto.
          </p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            <DatabaseZap className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="mt-3 text-lg font-semibold">Abierto a lo que ya usas</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pasarela de pago a tu elección (Redsys, Stripe…), conexión con OTAs, channel managers y
            touroperadores, e integración con asistentes de IA. Los conectores concretos se acuerdan
            en la implantación.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-navy">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-navy-strong">
              ¿Lo vemos con tu hotel en la cabeza?
            </h2>
            <p className="mt-1 text-navy-foreground/70">
              Elige día y hora. Sin compromiso y sin llamadas comerciales después si no te interesa.
            </p>
          </div>
          <a
            href={PAGES.demo}
            className="inline-flex items-center gap-2 rounded-md bg-navy-gold px-5 py-2.5 text-sm font-semibold text-navy-gold-foreground hover:bg-navy-gold/90"
          >
            <CalendarCheck className="h-4 w-4" aria-hidden="true" /> Elegir día y hora
          </a>
        </div>
      </section>
    </Layout>
  );
}
