import { useRef } from "react";
import { m, useInView } from "motion/react";
import { Database, Plug, Sparkles } from "lucide-react";

// AI as a layer over the hotel: data in, three ways to use it, real actions
// out. The booking assistant acts; the copilot only answers (read-only); MCP
// lets other assistants use the same tools. No invented capabilities.

const DATA = [
  "Habitaciones y tarifas",
  "Disponibilidad por noche",
  "Reservas y clientes",
  "Políticas de cancelación",
];

const LAYER = [
  {
    icon: Sparkles,
    name: "Asistente de reservas",
    where: "En la web del hotel",
    acts: [
      "Busca y cotiza",
      "Reserva y envía el pago",
      "Recupera la referencia",
      "Cancela con verificación",
    ],
    kind: "Actúa",
  },
  {
    icon: Database,
    name: "Copiloto",
    where: "En el panel de dirección",
    acts: ["Responde con los datos", "Enseña de dónde salen"],
    kind: "Solo lectura",
  },
  {
    icon: Plug,
    name: "MCP",
    where: "Claude u otros asistentes",
    acts: ["Las mismas herramientas", "Con un token por hotel"],
    kind: "Conecta",
  },
];

export function AiLayer() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px" });

  return (
    <div
      ref={ref}
      className="relative grid gap-6 lg:grid-cols-[0.9fr_auto_1.6fr] lg:items-center lg:gap-0"
    >
      {/* Hotel data */}
      <div className="rounded-2xl border border-navy-border bg-navy-accent/60 p-5">
        <p className="font-figure text-xs text-navy-foreground/60">Tu hotel</p>
        <ul className="mt-3 space-y-2">
          {DATA.map((d, i) => (
            <li
              key={d}
              data-reveal
              style={{ ["--d" as string]: `${100 + i * 80}ms` }}
              className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2 text-sm text-navy-strong"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-mineral" />
              {d}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-navy-foreground/60">
          El hotel lo fija el servidor: ningún asistente ve datos de otro hotel ni accede a la base
          de datos directamente.
        </p>
      </div>

      {/* Connector: one pulse of light travels once when the section appears */}
      <div aria-hidden="true" className="relative mx-auto h-10 w-px lg:h-px lg:w-20">
        <span className="absolute inset-0 bg-navy-border" />
        <m.span
          className="absolute h-3 w-full rounded-full bg-brass shadow-[0_0_14px_var(--brass)] lg:h-full lg:w-6"
          initial={{ opacity: 0 }}
          animate={inView ? { top: ["0%", "100%"], left: ["0%", "100%"], opacity: [0, 1, 0] } : {}}
          transition={{ duration: 1.1, delay: 0.5, ease: "easeInOut" }}
        />
      </div>

      {/* The layer and what comes out of it */}
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        {LAYER.map((l, i) => (
          <div
            key={l.name}
            data-reveal
            data-spotlight
            style={{ ["--d" as string]: `${150 + i * 120}ms` }}
            className={`rounded-2xl border p-5 ${
              i === 0
                ? "border-brass/40 bg-[linear-gradient(160deg,oklch(0.3_0.06_262),oklch(0.22_0.05_262))]"
                : "border-navy-border bg-navy-accent/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${i === 0 ? "bg-brass text-night" : "bg-white/[0.06] text-brass"}`}
              >
                <l.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span
                className={`font-figure rounded-full px-2 py-0.5 text-[0.7rem] ${i === 1 ? "bg-white/[0.06] text-navy-foreground/70" : "bg-mineral/20 text-[oklch(0.8_0.07_168)]"}`}
              >
                {l.kind}
              </span>
            </div>
            <p className="mt-4 font-semibold text-navy-strong">{l.name}</p>
            <p className="text-xs text-navy-foreground/60">{l.where}</p>
            <ul className="mt-4 space-y-1.5 text-sm text-navy-foreground/85">
              {l.acts.map((a) => (
                <li key={a} className="flex items-center gap-2">
                  <span aria-hidden="true" className="text-brass">
                    →
                  </span>
                  {a}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
