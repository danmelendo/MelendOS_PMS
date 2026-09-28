import { useEffect, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { ArrowRight, CalendarCheck } from "lucide-react";
import { PAGES } from "../config";
import { fetchSlots } from "../lib/api";
import { DEMO_MINUTES, DEMO_TIMEZONE } from "../../supabase/functions/_shared/slots.ts";

// The closing section: the next free demo times, live from the booking
// function; each one opens the demo form with that time chosen. If the agenda
// cannot load, the button still leads to the form.

const label = (iso: string) => ({
  day: new Date(iso).toLocaleDateString("es-ES", {
    timeZone: DEMO_TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }),
  time: new Date(iso).toLocaleTimeString("es-ES", {
    timeZone: DEMO_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }),
});

const STEPS = [
  ["Nos cuentas tu hotel", "Habitaciones, canales, cómo cobras y qué te quita tiempo hoy."],
  [
    "Lo ves funcionando",
    "Una reserva de principio a fin, la recepción de un día normal y el asistente.",
  ],
  [
    "Te vas con un precio",
    "Plan, implantación y plazos para tu caso, por escrito y sin compromiso.",
  ],
];

export function DemoAgenda() {
  const [slots, setSlots] = useState<string[] | null>(null);
  useEffect(() => {
    fetchSlots()
      .then((s) => setSlots(s.slice(0, 4)))
      .catch(() => setSlots([]));
  }, []);

  return (
    <div className="relative overflow-hidden rounded-[1.75rem] bg-night text-navy-foreground shadow-[var(--shadow-night)]">
      <img
        src="/melend-os.jpg"
        alt=""
        width={1400}
        height={700}
        loading="lazy"
        decoding="async"
        className="absolute top-0 right-0 h-full w-[150%] max-w-none object-cover object-right opacity-50 sm:w-[140%]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(100deg,oklch(0.16_0.04_262/0.97)_35%,oklch(0.16_0.04_262/0.7)_65%,oklch(0.16_0.04_262/0.35))]" />
      <div className="relative grid gap-10 p-7 sm:p-10 lg:grid-cols-[1.1fr_1fr] lg:p-14">
        <div>
          <p className="font-figure text-xs text-brass">Demo · {DEMO_MINUTES} min · videollamada</p>
          <h2 className="font-display mt-4 text-[2.6rem] text-balance text-navy-strong sm:text-[3.6rem]">
            ¿Lo vemos con tu hotel en la cabeza?
          </h2>
          <ol className="mt-8 space-y-4">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="font-figure mt-0.5 text-sm text-brass">0{i + 1}</span>
                <span>
                  <span className="block font-semibold text-navy-strong">{t}</span>
                  <span className="text-sm text-navy-foreground/70">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="self-end rounded-2xl border border-white/10 bg-white/[0.05] p-5 backdrop-blur-md">
          <p className="flex items-center gap-2 text-sm font-semibold text-navy-strong">
            <CalendarCheck className="h-4 w-4 text-brass" aria-hidden="true" /> Próximas horas
            libres
          </p>
          <p className="mt-1 text-xs text-navy-foreground/60">
            Hora de Madrid. Elige una y completa tus datos.
          </p>
          <div className="mt-4 grid min-h-[7.5rem] grid-cols-2 gap-2">
            <AnimatePresence initial={false}>
              {slots === null
                ? Array.from({ length: 4 }).map((_, i) => (
                    <span
                      key={`s${i}`}
                      className="h-[3.4rem] animate-pulse rounded-xl bg-white/[0.06]"
                    />
                  ))
                : slots.map((s, i) => {
                    const l = label(s);
                    return (
                      <m.a
                        key={s}
                        href={`${PAGES.demo}?slot=${encodeURIComponent(s)}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          delay: i * 0.06,
                          type: "spring",
                          stiffness: 260,
                          damping: 26,
                        }}
                        className="group rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 transition-colors hover:border-brass/60 hover:bg-brass/10"
                      >
                        <span className="block text-xs text-navy-foreground/70 capitalize">
                          {l.day}
                        </span>
                        <span className="font-figure text-lg text-navy-strong group-hover:text-brass">
                          {l.time}
                        </span>
                      </m.a>
                    );
                  })}
            </AnimatePresence>
            {slots?.length === 0 && (
              <p className="col-span-2 self-center text-sm text-navy-foreground/70">
                Elige el día y la hora que mejor te vengan en la agenda.
              </p>
            )}
          </div>
          <a href={PAGES.demo} className="btn btn-brass lean mt-4 w-full">
            Ver toda la agenda <ArrowRight aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
}
