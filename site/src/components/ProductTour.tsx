import { useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import { AnimatePresence, m } from "motion/react";
import { AgentMock, CopilotMock, MiReservaMock, PanelMock, ReportsMock, WebMock } from "./Mockups";
import { Tick } from "./ui";

// The product as one system: six parts of the same software, switched like
// the tabs of an app. Only what the product does today.

type Part = {
  id: string;
  label: string;
  who: string;
  title: string;
  points: string[];
  Mock: ComponentType;
  /** Tint of the backdrop light, so each part has its own context. */
  glow: string;
};

const PARTS: Part[] = [
  {
    id: "reception",
    label: "Recepción",
    who: "Para el equipo",
    title: "Todo el hotel en una pantalla",
    points: [
      "Planning de habitaciones por días, con la limpieza entre estancias ya calculada",
      "«Hoy»: llegadas, salidas, alojados y ocupación; check-in y cobro en un clic",
      "Reservas de la web, del asistente, de OTAs y de touroperadores en el mismo sitio",
      "Devoluciones desde el panel por la pasarela del hotel",
      "Equipo con roles y verificación en dos pasos; los datos sensibles, solo para dirección",
    ],
    Mock: PanelMock,
    glow: "oklch(0.7 0.11 234 / 0.22)",
  },
  {
    id: "web",
    label: "Web del hotel",
    who: "Para vender directo",
    title: "Tu motor de reservas, en tu dominio o en tu web actual",
    points: [
      "Plantilla editable desde el panel: logo, portada, textos, galería y contacto",
      "En tu dominio o en un subdominio propio",
      "¿Ya tienes web? Pega una línea y añade el buscador y el asistente",
      "Habitaciones en oferta y códigos promocionales aplicados en el servidor",
      "Páginas legales generadas con los datos del hotel, en español e inglés",
    ],
    Mock: WebMock,
    glow: "oklch(0.78 0.12 80 / 0.22)",
  },
  {
    id: "agent",
    label: "Asistente IA",
    who: "Para el cliente, a cualquier hora",
    title: "Un recepcionista que vende en tu web",
    points: [
      "Busca disponibilidad, cotiza, reserva y envía el enlace de pago conversando",
      "Recupera la referencia perdida y cancela verificando al huésped",
      "Precios y disponibilidad del mismo motor que la web: no los inventa",
      "Sin comisión por reserva: la venta es directa",
    ],
    Mock: AgentMock,
    glow: "oklch(0.62 0.12 290 / 0.16)",
  },
  {
    id: "mybooking",
    label: "Mi reserva",
    who: "Para el huésped",
    title: "La estancia, desde la web del hotel",
    points: [
      "El huésped encuentra su reserva con la referencia y su email",
      "Check-in online: datos del registro de viajeros y firma",
      "Chat con recepción, cuenta de la estancia y ampliación de noches",
      "Emails de confirmación y cancelación, en español o inglés",
      "Reseñas verificadas al terminar la estancia",
    ],
    Mock: MiReservaMock,
    glow: "oklch(0.52 0.08 168 / 0.2)",
  },
  {
    id: "copilot",
    label: "Copiloto",
    who: "Para dirección",
    title: "Pregunta por tu negocio como se lo preguntarías a tu director",
    points: [
      "«¿Qué habitaciones rinden menos entre semana?», «¿por qué cancelan?»",
      "Responde con los datos del hotel y enseña de dónde salen",
      "Solo lectura, con los permisos de quien pregunta",
    ],
    Mock: CopilotMock,
    glow: "oklch(0.78 0.12 80 / 0.18)",
  },
  {
    id: "reports",
    label: "Informes",
    who: "Para decidir",
    title: "Las cifras que mueven el hotel, sin hojas de cálculo",
    points: [
      "Ocupación, ADR, RevPAR, antelación, cancelaciones por motivo y canales",
      "Comparación con el año anterior y por hotel del grupo",
      "Exportación diaria de tus datos para análisis",
    ],
    Mock: ReportsMock,
    glow: "oklch(0.7 0.11 234 / 0.2)",
  },
];

export function ProductTour() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const part = PARTS[active];

  // Arrow keys move between tabs, as in any tab list.
  const onKey = (e: KeyboardEvent) => {
    const delta = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = (active + delta + PARTS.length) % PARTS.length;
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[15rem_1fr] lg:gap-12">
      <div
        role="tablist"
        aria-label="Partes del producto"
        aria-orientation="vertical"
        onKeyDown={onKey}
        className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0"
      >
        {PARTS.map((p, i) => {
          const on = i === active;
          return (
            <button
              key={p.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`tab-${p.id}`}
              aria-selected={on}
              aria-controls="tour-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(i)}
              className={`relative shrink-0 rounded-lg px-4 py-3 text-left transition-colors ${on ? "text-foreground" : "text-stone hover:text-foreground"}`}
            >
              {on && (
                <m.span
                  layoutId="tour-indicator"
                  className="absolute inset-0 rounded-lg bg-card shadow-[var(--shadow-rest)]"
                  transition={{ type: "spring", stiffness: 380, damping: 34 }}
                />
              )}
              <span className="relative flex items-center gap-3">
                <span
                  className={`font-figure text-[0.7rem] ${on ? "text-brass-deep" : "text-stone/60"}`}
                >
                  0{i + 1}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{p.label}</span>
                  <span className="hidden text-xs text-stone lg:block">{p.who}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div
        id="tour-panel"
        role="tabpanel"
        aria-labelledby={`tab-${part.id}`}
        className="relative grid items-center gap-8 xl:grid-cols-[0.85fr_1.15fr]"
      >
        <m.div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-10 -z-10 rounded-[3rem] blur-2xl"
          animate={{
            background: `radial-gradient(60% 60% at 70% 45%, ${part.glow}, transparent 70%)`,
          }}
          transition={{ duration: 0.6 }}
        />
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={`t-${part.id}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="font-figure text-xs text-stone">{part.who}</p>
            <h3 className="font-display mt-2 text-[2rem] leading-tight text-balance">
              {part.title}
            </h3>
            <ul className="mt-5 space-y-3">
              {part.points.map((p) => (
                <li key={p} className="flex gap-2.5 text-[0.95rem] leading-relaxed text-stone">
                  <Tick className="mt-1" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </m.div>
        </AnimatePresence>
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={`m-${part.id}`}
            initial={{ opacity: 0, y: 16, scale: 0.985, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, scale: 0.99, filter: "blur(6px)" }}
            transition={{ type: "spring", stiffness: 220, damping: 28 }}
          >
            <part.Mock />
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
