import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import { Globe, KeyRound, MessagesSquare, Receipt } from "lucide-react";
import { Bubble } from "./Mockups";
import { Tick } from "./ui";

// "Un día en el hotel": the operation told as a stay, from the booking to the
// check-out. On wide screens the steps scroll on the left while one sticky
// card on the right changes state; on phones each step carries its own card.

const STEPS: {
  icon: typeof Globe;
  time: string;
  title: string;
  text: string;
  card: () => ReactNode;
}[] = [
  {
    icon: Globe,
    time: "09:12",
    title: "Entra la reserva",
    text: "Desde la web del hotel, el widget en la web que ya tienes, el asistente de IA o una OTA. Todas aterrizan en el mismo planning, con el precio calculado en el servidor.",
    card: () => (
      <div className="space-y-2">
        {[
          ["Web directa", "Méndez · 3 noches", "0 % comisión"],
          ["Asistente IA", "Keller · 2 noches", "pago online"],
          ["OTA", "Silva · 5 noches", "vía canal"],
        ].map(([src, who, note], i) => (
          <div
            key={src}
            className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-xs"
            style={{ opacity: 1 - i * 0.12 }}
          >
            <span>
              <span className="block text-[10px] text-muted-foreground">{src}</span>
              <span className="font-medium">{who}</span>
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">{note}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: KeyRound,
    time: "13:40",
    title: "Check-in antes de llegar",
    text: "El huésped rellena los datos del registro de viajeros y firma desde «Mi reserva», así recepción no teclea nada. Al hacer la entrada, el parte de viajeros sale solo hacia SES.HOSPEDAJES.",
    card: () => (
      <ul className="space-y-2 text-xs">
        {["Datos del documento", "Firma del huésped", "Parte enviado a SES.HOSPEDAJES"].map((t) => (
          <li key={t} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600/10">
              <Tick className="h-3.5 w-3.5 !text-emerald-700" />
            </span>
            {t}
          </li>
        ))}
      </ul>
    ),
  },
  {
    icon: MessagesSquare,
    time: "21:05",
    title: "Durante la estancia",
    text: "Toallas, room service o una noche más: el huésped lo pide por chat y recepción contesta en tiempo real. Los cargos van a la cuenta de la habitación.",
    card: () => (
      <div className="space-y-2">
        <Bubble from="guest">¿Nos podemos quedar una noche más?</Bubble>
        <Bubble from="bot">Sí, la habitación está libre. Os la añadimos: 118 €.</Bubble>
        <div className="flex justify-between rounded-lg border bg-background px-3 py-2 text-xs">
          <span>Ampliación · 1 noche</span>
          <span className="font-mono">118,00 €</span>
        </div>
      </div>
    ),
  },
  {
    icon: Receipt,
    time: "11:30",
    title: "Salida sin colas",
    text: "Paga el saldo online o en recepción, recibe la factura con su registro VERI*FACTU y, al terminar, deja una reseña verificada que el hotel puede responder.",
    card: () => (
      <div className="rounded-lg border bg-background p-3 text-xs">
        <div className="flex justify-between">
          <span>Estancia · 4 noches</span>
          <span className="font-mono">472,00 €</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Cargos a la habitación</span>
          <span className="font-mono">7,00 €</span>
        </div>
        <div className="mt-2 flex justify-between border-t pt-2 font-semibold">
          <span>Pagado</span>
          <span className="font-mono">479,00 €</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="grid h-8 w-8 grid-cols-3 gap-px rounded bg-foreground p-1">
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className={i % 2 ? "bg-card" : "bg-foreground"} />
            ))}
          </span>
          <span className="text-[10px] text-muted-foreground">
            Factura F-2026-0412 · VERI*FACTU
          </span>
        </div>
      </div>
    ),
  },
];

export function StayStory() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const step = STEPS[active];
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
      <ol className="relative">
        {/* The day's timeline */}
        <span aria-hidden="true" className="absolute top-3 bottom-3 left-[1.1rem] w-px bg-border" />
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            ref={(el) => {
              refs.current[i] = el;
            }}
            data-step={i}
            className="relative pb-14 pl-14 last:pb-0 lg:min-h-[30vh] lg:pb-10"
          >
            <span
              className={`absolute top-0 left-0 flex h-9 w-9 items-center justify-center rounded-full border transition-colors duration-300 ${
                i === active
                  ? "border-brass-deep/40 bg-brass text-night"
                  : "border-border bg-card text-stone"
              }`}
            >
              <s.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="font-figure text-xs text-stone">{s.time}</p>
            <h3
              className={`font-display mt-1 text-[1.9rem] transition-colors duration-300 ${
                i === active ? "text-foreground" : "text-foreground/45 lg:text-foreground/35"
              }`}
            >
              {s.title}
            </h3>
            <p
              className={`mt-2 max-w-md leading-relaxed text-stone transition-opacity duration-300 ${i === active ? "" : "lg:opacity-50"}`}
            >
              {s.text}
            </p>
            {/* Phones: the card goes with its step */}
            <div
              className="product-ui mt-5 rounded-xl border bg-card p-4 shadow-[var(--shadow-rest)] lg:hidden"
              aria-hidden="true"
            >
              {s.card()}
            </div>
          </li>
        ))}
      </ol>

      <div className="hidden lg:block">
        <div className="sticky top-28">
          <div
            className="product-ui relative overflow-hidden rounded-2xl border border-black/[0.06] bg-card p-6 shadow-[var(--shadow-lift)]"
            aria-hidden="true"
          >
            <div className="mb-5 flex items-center justify-between">
              <p className="text-xs font-semibold">Reserva 7F3A91C2 · Hotel Mar</p>
              <div className="flex gap-1">
                {STEPS.map((_, i) => (
                  <m.span
                    key={i}
                    className="h-1 rounded-full bg-gold"
                    animate={{ width: i === active ? 22 : 6, opacity: i <= active ? 1 : 0.3 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                ))}
              </div>
            </div>
            <div className="min-h-[13rem]">
              <AnimatePresence mode="wait" initial={false}>
                <m.div
                  key={active}
                  initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <step.icon className="h-4 w-4 text-gold-foreground" />
                    {step.title}
                  </p>
                  {step.card()}
                </m.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
