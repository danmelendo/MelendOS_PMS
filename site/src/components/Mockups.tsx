// Illustrations of the product for the sales website, drawn with the panel's
// own tokens so they look like the real screens. Decorative: every screen is
// also described in text next to it, and the live demo is one click away.
import type { ReactNode } from "react";
import {
  BarChart3,
  Bot,
  CalendarDays,
  ClipboardList,
  CreditCard,
  MessagesSquare,
  Sparkles,
  Users,
} from "lucide-react";

function Window({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-xl border bg-card text-foreground shadow-[0_24px_60px_-24px_oklch(0.225_0.058_262/0.45)]"
    >
      <div className="flex items-center gap-1.5 border-b bg-muted px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="ml-3 truncate text-[11px] text-muted-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}

const DAYS = ["L 12", "M 13", "X 14", "J 15", "V 16", "S 17", "D 18", "L 19", "M 20", "X 21"];
// [room, first day, nights, tone, guest]
const STAYS: [number, number, number, "navy" | "sky" | "gold", string][] = [
  [0, 0, 3, "navy", "Ruiz"],
  [0, 4, 3, "sky", "Keller"],
  [1, 1, 2, "sky", "Moreau"],
  [1, 5, 4, "navy", "García"],
  [2, 0, 5, "gold", "Booking · Silva"],
  [2, 7, 2, "sky", "Park"],
  [3, 2, 4, "navy", "Lindqvist"],
  [4, 0, 2, "navy", "Ortega"],
  [4, 3, 6, "sky", "Rossi"],
  [5, 5, 3, "gold", "Touroperador"],
];
const TONES = {
  navy: "bg-primary text-primary-foreground",
  sky: "bg-info/25 text-info-foreground",
  gold: "bg-gold/30 text-gold-foreground",
};

/** Staff panel: sidebar and the rooms × days planning. */
export function PanelMock() {
  const rooms = ["101", "102", "201", "202", "301", "302"];
  const nav = [
    { icon: CalendarDays, label: "Calendario", active: true },
    { icon: ClipboardList, label: "Reservas" },
    { icon: MessagesSquare, label: "Mensajes" },
    { icon: Users, label: "Clientes" },
    { icon: BarChart3, label: "Informes" },
  ];
  return (
    <Window title="Panel · Calendario">
      <div className="flex">
        <div className="hidden w-36 shrink-0 space-y-1 bg-navy p-2 sm:block">
          {nav.map((n) => (
            <div
              key={n.label}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] ${
                n.active
                  ? "bg-navy-accent text-navy-strong shadow-[inset_3px_0_0_var(--navy-gold)]"
                  : "text-navy-foreground/70"
              }`}
            >
              <n.icon className={`h-3.5 w-3.5 ${n.active ? "text-navy-gold" : ""}`} />
              {n.label}
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 p-3">
          <div className="grid grid-cols-[2.25rem_repeat(10,minmax(0,1fr))] text-[10px]">
            <span />
            {DAYS.map((d, i) => (
              <span
                key={d}
                className={`pb-1 text-center ${i === 2 ? "font-semibold text-gold-foreground" : "text-muted-foreground"}`}
              >
                {d}
              </span>
            ))}
            {rooms.map((room, r) => (
              <div key={room} className="contents">
                <span className="flex h-7 items-center font-medium text-foreground">{room}</span>
                <div className="relative col-span-10 h-7 border-t border-dashed">
                  {STAYS.filter(([row]) => row === r).map(([, start, nights, tone, guest]) => (
                    <span
                      key={`${start}-${guest}`}
                      className={`absolute top-1 bottom-1 truncate rounded px-1.5 text-[10px] leading-5 ${TONES[tone]}`}
                      style={{ left: `${start * 10}%`, width: `calc(${nights * 10}% - 3px)` }}
                    >
                      {guest}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              ["Llegadas hoy", "7"],
              ["Salidas hoy", "5"],
              ["Ocupación", "86 %"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border bg-background px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground">{k}</p>
                <p className="text-sm font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Window>
  );
}

function Bubble({ from, children }: { from: "guest" | "bot"; children: ReactNode }) {
  return (
    <div className={`flex ${from === "guest" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
          from === "guest" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** Booking assistant on the hotel's website. */
export function AgentMock() {
  return (
    <Window title="hotel-lumen.com · Asistente">
      <div className="space-y-2.5 p-4">
        <div className="flex items-center gap-2 pb-1 text-xs font-medium">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <Bot className="h-3.5 w-3.5" />
          </span>
          ¿Te ayudo a reservar?
        </div>
        <Bubble from="guest">¿Tenéis doble para dos del 14 al 16 de marzo?</Bubble>
        <Bubble from="bot">
          Sí: la <b>Doble Superior</b> está libre esas 2 noches. Total <b>236 €</b>, cancelación
          gratis hasta 48 h antes. ¿A nombre de quién la reservo?
        </Bubble>
        <Bubble from="guest">Laura Méndez, laura@correo.es</Bubble>
        <Bubble from="bot">Hecho. Referencia 7F3A91C2. Puedes pagarla aquí:</Bubble>
        <div className="flex">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            <CreditCard className="h-3.5 w-3.5" /> Pagar 236 €
          </span>
        </div>
      </div>
    </Window>
  );
}

/** Management copilot in the panel. */
export function CopilotMock() {
  const bars = [62, 70, 74, 81, 93, 97, 68];
  return (
    <Window title="Panel · Copiloto">
      <div className="space-y-3 p-4">
        <Bubble from="guest">¿Cómo va este mes frente al año pasado?</Bubble>
        <div className="rounded-lg border bg-background p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Sparkles className="h-3.5 w-3.5 text-gold-foreground" /> Septiembre, hasta hoy
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            {[
              ["Ocupación", "84 %", "+6 pp"],
              ["ADR", "118 €", "+4 %"],
              ["RevPAR", "99 €", "+12 %"],
            ].map(([k, v, d]) => (
              <div key={k}>
                <p className="text-[10px] text-muted-foreground">{k}</p>
                <p className="font-semibold tabular-nums">{v}</p>
                <p className="text-[10px] text-info-foreground">{d}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Los fines de semana tiran del mes; entre semana la ocupación baja al 71 %.
          </p>
          <div className="mt-2 flex h-14 items-end gap-1.5">
            {bars.map((h, i) => (
              <span
                key={i}
                className={`flex-1 rounded-t-sm ${i >= 4 && i <= 5 ? "bg-primary" : "bg-info/40"}`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="mt-1 flex gap-1.5 text-[9px] text-muted-foreground">
            {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
              <span key={d} className="flex-1 text-center">
                {d}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Window>
  );
}

/** Guest app during the stay: chat requests and the room bill. */
export function GuestAppMock() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto w-full max-w-[17rem] rounded-[2rem] border-[6px] border-navy bg-card p-3 text-foreground shadow-[0_24px_60px_-24px_oklch(0.225_0.058_262/0.45)]"
    >
      <div className="rounded-xl bg-navy p-3 text-navy-strong">
        <p className="text-[10px] text-navy-foreground/70">Tu estancia · Hab. 204</p>
        <p className="text-sm font-semibold">Albora Hotel & Spa</p>
        <p className="text-[10px] text-navy-foreground/70">14 → 17 mar · 3 noches</p>
      </div>
      <p className="mt-3 text-[11px] font-medium">Pide a recepción</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {["Toallas", "Room service", "Late checkout", "Taxi"].map((c) => (
          <span
            key={c}
            className="rounded-full bg-secondary px-2 py-1 text-[10px] text-secondary-foreground"
          >
            {c}
          </span>
        ))}
      </div>
      <div className="mt-3 space-y-1.5">
        <Bubble from="guest">¿Podéis subir dos cafés?</Bubble>
        <Bubble from="bot">¡Claro! En 10 minutos. Lo cargamos a la habitación.</Bubble>
      </div>
      <div className="mt-3 rounded-lg border p-2 text-[11px]">
        <div className="flex justify-between">
          <span>Estancia</span>
          <span className="tabular-nums">354,00 €</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Room service</span>
          <span className="tabular-nums">7,00 €</span>
        </div>
        <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
          <span>Pendiente</span>
          <span className="tabular-nums text-gold-foreground">7,00 €</span>
        </div>
      </div>
    </div>
  );
}

/** Reports: headline KPIs and occupancy by month. */
export function ReportsMock() {
  const months = [48, 55, 63, 71, 78, 92, 97, 95, 84, 70, 58, 61];
  return (
    <Window title="Panel · Informes">
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Ocupación", "73 %"],
            ["ADR", "112 €"],
            ["RevPAR", "82 €"],
            ["Directas", "41 %"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-md border bg-background px-2 py-1.5">
              <p className="text-[10px] text-muted-foreground">{k}</p>
              <p className="text-sm font-semibold tabular-nums">{v}</p>
            </div>
          ))}
        </div>
        <div className="flex h-28 items-end gap-1.5 rounded-md border bg-background p-2">
          {months.map((h, i) => (
            <span
              key={i}
              className={`flex-1 rounded-t-sm ${h >= 90 ? "bg-gold" : "bg-primary/80"}`}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-primary/80" /> Ocupación mensual
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-gold" /> Temporada alta
          </span>
        </div>
      </div>
    </Window>
  );
}
