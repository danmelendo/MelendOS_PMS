import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  m,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { FileCheck2, KeyRound, ScrollText } from "lucide-react";
import { Planning, Window } from "./Mockups";

// The hero's centrepiece: the planning board in slight perspective with the
// day's activity floating around it. Every event shown exists in the product.
// Layers sit at different depths and follow the cursor a little; entrances
// are CSS (they run before hydration), the live bits are Motion.

const EVENTS = [
  {
    icon: KeyRound,
    title: "Check-in online completado",
    detail: "Hab. 204 · datos del registro y firma",
  },
  {
    icon: ScrollText,
    title: "Parte enviado a SES.HOSPEDAJES",
    detail: "2 viajeros · aceptado",
  },
  {
    icon: FileCheck2,
    title: "Factura registrada · VERI*FACTU",
    detail: "F-2026-0412 · con QR",
  },
];

const WEEK = [58, 66, 71, 74, 88, 96, 86];

export function HeroBoard() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 120, damping: 20, mass: 0.6 });
  const sy = useSpring(my, { stiffness: 120, damping: 20, mass: 0.6 });
  // Deeper layers move more: the board barely, floating cards a bit more.
  const boardRotY = useTransform(sx, (v) => -9 + v * 3);
  const boardRotX = useTransform(sy, (v) => 6 - v * 2.5);
  const nearX = useTransform(sx, (v) => v * 14);
  const nearY = useTransform(sy, (v) => v * 10);
  const farX = useTransform(sx, (v) => v * -8);
  const farY = useTransform(sy, (v) => v * -6);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      mx.set(((e.clientX - r.left) / r.width - 0.5) * 2);
      my.set(((e.clientY - r.top) / r.height - 0.5) * 2);
    };
    const leave = () => {
      mx.set(0);
      my.set(0);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [mx, my, reduced]);

  // The day's events arrive one after another, once, then the last one stays.
  const [event, setEvent] = useState(0);
  useEffect(() => {
    if (reduced) return;
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      if (i >= EVENTS.length) return clearInterval(t);
      setEvent(i);
    }, 2600);
    return () => clearInterval(t);
  }, [reduced]);

  // Occupancy ticks up when the new booking lands on the board.
  const [occupancy, setOccupancy] = useState(84);
  useEffect(() => {
    if (reduced) return setOccupancy(86);
    const t = setTimeout(() => setOccupancy(86), 2100);
    return () => clearTimeout(t);
  }, [reduced]);

  const e = EVENTS[event];
  return (
    <div ref={ref} className="relative [perspective:1600px]" aria-hidden="true">
      {/* Board */}
      <m.div
        style={{ rotateY: boardRotY, rotateX: boardRotX, transformStyle: "preserve-3d" }}
        className="drift-in relative [--d:150ms] [--from-y:30px]"
      >
        <Window url="panel.melendo.app/calendario" className="w-full">
          <div className="p-3 sm:p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <p className="text-xs font-semibold">Planning · Hotel Mar</p>
              <p className="font-mono text-[10px] text-muted-foreground">Miércoles 14</p>
            </div>
            <Planning fresh />
          </div>
        </Window>
      </m.div>

      {/* Occupancy: the isologo's rising bars */}
      <m.div
        style={{ x: nearX, y: nearY }}
        className="absolute -top-12 left-0 w-40 sm:top-auto sm:-bottom-8 sm:-left-8 sm:w-52"
      >
        <div className="drift-in product-ui rounded-xl border border-black/[0.06] bg-card p-3 shadow-[0_24px_50px_-20px_oklch(0.1_0.04_262/0.6)] [--d:650ms] [--from-x:-16px]">
          <p className="text-[10px] text-muted-foreground">Ocupación esta noche</p>
          <p className="mt-0.5 font-mono text-2xl font-semibold tabular-nums">
            <m.span
              key={occupancy}
              initial={reduced ? false : { opacity: 0, y: 6, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className="inline-block"
            >
              {occupancy}
            </m.span>
            <span className="text-base text-muted-foreground"> %</span>
          </p>
          <div className="mt-2 flex h-10 items-end gap-1">
            {WEEK.map((h, i) => (
              <span
                key={i}
                className={`bar-grow flex-1 rounded-t-[3px] ${i === WEEK.length - 1 ? "bg-gold" : "bg-primary/85"}`}
                style={{ height: `${h}%`, ["--d" as string]: `${800 + i * 70}ms` }}
              />
            ))}
          </div>
        </div>
      </m.div>

      {/* Direct booking */}
      <m.div
        style={{ x: farX, y: farY }}
        className="absolute -top-6 right-2 hidden sm:-right-4 sm:block"
      >
        <div className="drift-in product-ui rounded-xl border border-black/[0.06] bg-card px-3 py-2.5 shadow-[0_20px_40px_-18px_oklch(0.1_0.04_262/0.55)] [--d:1300ms] [--from-y:-14px]">
          <p className="text-[10px] text-muted-foreground">Nueva reserva · web directa</p>
          <p className="text-xs font-semibold">Méndez · 3 noches · 354 €</p>
          <p className="mt-0.5 font-mono text-[10px] text-emerald-700">0 % comisión</p>
        </div>
      </m.div>

      {/* The day's events */}
      <m.div
        style={{ x: nearX, y: nearY }}
        className="absolute right-3 -bottom-10 w-60 sm:-right-6 sm:w-64"
      >
        <div className="drift-in [--d:1900ms] [--from-x:16px]">
          <AnimatePresence mode="popLayout" initial={false}>
            <m.div
              key={event}
              initial={{ opacity: 0, y: 14, scale: 0.97, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, scale: 0.98, filter: "blur(4px)" }}
              transition={{ type: "spring", stiffness: 240, damping: 26 }}
              className="flex items-start gap-2.5 rounded-xl bg-navy/95 p-3 text-white shadow-[0_0_0_1px_oklch(1_0_0/0.08),0_24px_50px_-18px_oklch(0.05_0.03_262/0.9)] backdrop-blur"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brass/15 text-brass">
                <e.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold">{e.title}</span>
                <span className="block truncate font-mono text-[10px] text-white/60">
                  {e.detail}
                </span>
              </span>
            </m.div>
          </AnimatePresence>
        </div>
      </m.div>
    </div>
  );
}
