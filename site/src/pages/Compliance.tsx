import { FileText, UserCheck } from "lucide-react";
import { Layout } from "../components/Layout";
import { ComplianceLedger } from "../components/Compliance";
import { DemoAgenda } from "../components/DemoAgenda";
import { Marker, SectionHead } from "../components/ui";
import { COMPLIANCE_FAQ } from "../content/faq";

// Landing for searches about the legal obligations. Facts only, with dates and
// the rule behind each one.
const RULES = [
  {
    icon: UserCheck,
    name: "SES.HOSPEDAJES",
    law: "Real Decreto 933/2021",
    since: "Obligatorio desde el 2 de diciembre de 2024",
    points: [
      "Hoteles, hostales, pensiones, apartamentos turísticos y campings.",
      "Comunicar al Ministerio del Interior los datos de cada viajero como tarde 24 horas después de su llegada, y los de las reservas.",
      "Conservar los datos durante tres años.",
    ],
  },
  {
    icon: FileText,
    name: "VeriFactu",
    law: "Real Decreto 1007/2023 y Real Decreto-ley 15/2025",
    since: "1 de enero de 2027 (sociedades) · 1 de julio de 2027 (autónomos)",
    points: [
      "El programa con el que facturas debe registrar cada factura de forma encadenada, sin poder alterarla.",
      "Cada factura lleva un código QR para que el cliente pueda verificarla en la Agencia Tributaria.",
      "Afecta a cualquier negocio que facture con software: también a hoteles y hostales.",
    ],
  },
];

export function CompliancePage() {
  return (
    <Layout page="compliance">
      <section className="lamp relative overflow-hidden bg-night text-navy-foreground">
        <div aria-hidden="true" className="ledger-grid absolute inset-0" />
        <div className="relative mx-auto max-w-7xl px-4 pt-16 pb-24 sm:px-6 lg:px-8">
          <div className="rise">
            <Marker n="Normativa" onNight>
              Para alojamientos en España
            </Marker>
          </div>
          <h1 className="font-display rise mt-5 max-w-4xl text-[2.9rem] text-balance text-navy-strong [--d:80ms] sm:text-[4.2rem]">
            SES.HOSPEDAJES y VeriFactu: <em className="text-brass">qué te exigen</em> y cómo cumplir
          </h1>
          <p className="rise mt-5 max-w-2xl text-lg text-navy-foreground/75 [--d:160ms]">
            Dos obligaciones que cambian cómo registra huéspedes y factura cualquier hotel u hostal
            en España. Aquí tienes lo esencial y cómo lo resuelve Melend/OS.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-24 sm:px-6 md:grid-cols-2 lg:px-8">
        {RULES.map((r, i) => (
          <article
            key={r.name}
            data-reveal
            data-spotlight
            style={{ ["--d" as string]: `${i * 120}ms` }}
            className={`surface rounded-2xl p-7 sm:p-9 ${i === 1 ? "md:mt-12" : ""}`}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-display text-[2.4rem] leading-none">{r.name}</h2>
              <r.icon className="h-5 w-5 shrink-0 text-brass-deep" aria-hidden="true" />
            </div>
            <p className="font-figure mt-3 text-xs text-stone">{r.law}</p>
            <p className="mt-5 border-l-2 border-brass pl-3 text-sm font-medium">{r.since}</p>
            <ul className="mt-6 space-y-3 text-[0.95rem] leading-relaxed text-stone">
              {r.points.map((p) => (
                <li key={p} className="flex gap-3">
                  <span className="mt-2.5 h-px w-3 shrink-0 bg-brass-deep" aria-hidden="true" />
                  {p}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="border-y border-border/70 bg-card">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:px-8">
          <SectionHead
            n="01"
            label="Cómo te ayuda Melend/OS"
            title="El sistema lo registra, lo envía y lo guarda"
            lead="Incluido en todos los planes, sin coste aparte."
          />
          <div data-reveal="scale">
            <ComplianceLedger />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
        <SectionHead n="02" label="Dudas" title="Preguntas frecuentes" />
        <div className="surface mt-10 divide-y rounded-2xl" data-reveal>
          {COMPLIANCE_FAQ.map((f) => (
            <details key={f.q} className="group px-6 py-5" open>
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
        <p className="mt-4 text-xs text-stone">
          Información general a septiembre de 2026, no asesoramiento legal. Consulta a tu gestoría
          cómo te afecta cada obligación.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8" data-reveal="scale">
        <DemoAgenda />
      </section>
    </Layout>
  );
}
