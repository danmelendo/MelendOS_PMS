import { CalendarCheck, FileText, UserCheck } from "lucide-react";
import { Layout } from "../components/Layout";
import { ComplianceList } from "../components/Compliance";
import { PAGES } from "../config";
import { COMPLIANCE_FAQ } from "../content/faq";

// Landing for searches about the legal obligations. Facts only, with dates and
// the rule behind each one; what the product does not do yet says so.
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
      <section className="bg-navy text-navy-foreground">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <p className="text-sm font-semibold text-navy-gold">Normativa para alojamientos</p>
          <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-balance text-navy-strong sm:text-4xl">
            SES.HOSPEDAJES y VeriFactu: qué te exigen y cómo cumplir
          </h1>
          <p className="mt-3 max-w-2xl text-navy-foreground/75">
            Dos obligaciones que cambian cómo registra huéspedes y factura cualquier hotel u hostal
            en España. Aquí tienes lo esencial y en qué punto está Melend/OS.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-4 py-14 sm:px-6 md:grid-cols-2">
        {RULES.map((r) => (
          <article key={r.name} className="rounded-xl border bg-card p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <r.icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="mt-3 text-xl font-semibold tracking-tight">{r.name}</h2>
            <p className="text-sm text-muted-foreground">{r.law}</p>
            <p className="mt-3 rounded-md bg-gold/15 px-3 py-2 text-sm font-medium text-gold-foreground">
              {r.since}
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
              {r.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="border-y bg-card">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">Cómo te ayuda Melend/OS</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Incluido en todos los planes, sin coste aparte. Te decimos con claridad qué ya funciona
            y qué estamos construyendo.
          </p>
          <div className="mt-8">
            <ComplianceList />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">Preguntas frecuentes</h2>
        <div className="mt-6 divide-y rounded-xl border bg-card">
          {COMPLIANCE_FAQ.map((f) => (
            <details key={f.q} className="group px-5 py-4" open>
              <summary className="cursor-pointer list-none font-medium marker:hidden">
                {f.q}
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Información general a septiembre de 2026, no asesoramiento legal. Consulta a tu gestoría
          cómo te afecta cada obligación.
        </p>
        <div className="mt-10 text-center">
          <a
            href={PAGES.demo}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <CalendarCheck className="h-4 w-4" aria-hidden="true" /> Cuéntanos tu caso en una demo
          </a>
        </div>
      </section>
    </Layout>
  );
}
