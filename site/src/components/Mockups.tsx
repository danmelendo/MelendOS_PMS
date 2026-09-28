// Illustrations of the product for the sales website. They sit inside
// `.product-ui`, which restores the staff panel's real colours, so what they
// show is what the software looks like. Decorative: every screen is also
// described in text next to it.
import type { ReactNode } from "react";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Globe,
  Lock,
  MessagesSquare,
  Search,
  Sparkles,
  Tag,
  Users,
} from "lucide-react";

export function Window({
  children,
  url,
  className = "",
}: {
  children: ReactNode;
  url: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`product-ui overflow-hidden rounded-xl border border-black/[0.06] bg-card text-foreground shadow-[0_1px_0_0_rgba(255,255,255,0.8)_inset,0_30px_70px_-30px_oklch(0.16_0.04_262/0.5)] ${className}`}
    >
      <div className="flex items-center gap-3 border-b bg-muted/70 px-3 py-2">
        <span className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-black/10" />
          <span className="h-2 w-2 rounded-full bg-black/10" />
          <span className="h-2 w-2 rounded-full bg-black/10" />
        </span>
        <span className="flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-md bg-card/80 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          <Lock className="h-2.5 w-2.5 shrink-0" />
          {url}
        </span>
        <span className="w-8" />
      </div>
      {children}
    </div>
  );
}

const DAYS = ["L 12", "M 13", "X 14", "J 15", "V 16", "S 17", "D 18", "L 19", "M 20", "X 21"];
// [room, first day, nights, tone, guest]
type Stay = [number, number, number, "navy" | "sky" | "gold", string];
const STAYS: Stay[] = [
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

/**
 * The rooms x days planning. `fresh` draws one extra booking arriving (the
 * hero uses it: a direct booking lands on the board).
 */
export function Planning({
  fresh = false,
  compact = false,
}: {
  fresh?: boolean;
  compact?: boolean;
}) {
  const rooms = ["101", "102", "201", "202", "301", "302"];
  return (
    <div className="grid grid-cols-[2.25rem_repeat(10,minmax(0,1fr))] text-[10px]">
      <span />
      {DAYS.map((d, i) => (
        <span
          key={d}
          className={`pb-1.5 text-center font-mono ${i === 2 ? "font-semibold text-gold-foreground" : "text-muted-foreground"}`}
        >
          {d}
        </span>
      ))}
      {rooms.map((room, r) => (
        <div key={room} className="contents">
          <span
            className={`flex items-center font-mono font-medium text-foreground ${compact ? "h-6" : "h-7"}`}
          >
            {room}
          </span>
          <div className={`relative col-span-10 border-t border-dashed ${compact ? "h-6" : "h-7"}`}>
            {STAYS.filter(([row]) => row === r).map(([, start, nights, tone, guest]) => (
              <span
                key={`${start}-${guest}`}
                className={`stay-bar absolute top-1 bottom-1 truncate rounded px-1.5 text-[10px] leading-5 ${TONES[tone]}`}
                style={{ left: `${start * 10}%`, width: `calc(${nights * 10}% - 3px)` }}
              >
                {guest}
              </span>
            ))}
            {fresh && r === 3 && (
              <span
                className="stay-bar booking-in absolute top-1 bottom-1 truncate rounded bg-gold px-1.5 text-[10px] leading-5 font-semibold text-navy [--d:1500ms]"
                style={{ left: "70%", width: "calc(30% - 3px)" }}
              >
                Web · Méndez
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PanelNav({ active }: { active: string }) {
  const nav = [
    { icon: CalendarDays, label: "Calendario" },
    { icon: ClipboardList, label: "Reservas" },
    { icon: MessagesSquare, label: "Mensajes" },
    { icon: Users, label: "Clientes" },
    { icon: BarChart3, label: "Informes" },
  ];
  return (
    <div className="hidden w-32 shrink-0 space-y-1 bg-navy p-2 sm:block">
      {nav.map((n) => {
        const on = n.label === active;
        return (
          <div
            key={n.label}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] ${
              on
                ? "bg-navy-accent text-white shadow-[inset_3px_0_0_var(--navy-gold)]"
                : "text-navy-foreground/70"
            }`}
          >
            <n.icon className={`h-3.5 w-3.5 ${on ? "text-navy-gold" : ""}`} />
            {n.label}
          </div>
        );
      })}
    </div>
  );
}

/** Staff panel: sidebar, planning and today's figures. */
export function PanelMock() {
  return (
    <Window url="panel.melendo.app/calendario">
      <div className="flex">
        <PanelNav active="Calendario" />
        <div className="min-w-0 flex-1 p-3">
          <Planning />
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              ["Llegadas hoy", "7"],
              ["Salidas hoy", "5"],
              ["Ocupación", "86 %"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border bg-background px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground">{k}</p>
                <p className="font-mono text-sm font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Window>
  );
}

export function Bubble({ from, children }: { from: "guest" | "bot"; children: ReactNode }) {
  return (
    <div className={`flex ${from === "guest" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
          from === "guest"
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md bg-muted text-foreground"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** The hotel's own booking website: template, own domain, offers. */
export function WebMock() {
  return (
    <Window url="reservas.hotelmar.es">
      <div className="relative h-24 overflow-hidden bg-[linear-gradient(135deg,oklch(0.42_0.06_230),oklch(0.28_0.06_255))]">
        <div className="absolute inset-0 bg-[radial-gradient(18rem_8rem_at_75%_20%,oklch(0.85_0.08_80/0.35),transparent_70%)]" />
        <div className="relative flex items-center justify-between px-4 pt-3 text-white">
          <span className="text-xs font-semibold tracking-wide">Hotel Mar</span>
          <span className="text-[10px] opacity-80">Habitaciones · Ofertas · Mi reserva</span>
        </div>
        <p
          className="relative mt-3 px-4 text-lg leading-tight text-white"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Frente al mar, a dos calles del casco antiguo
        </p>
      </div>
      <div className="-mt-4 px-3">
        <div className="relative flex items-center gap-2 rounded-lg border bg-card p-2 text-[11px] shadow-md">
          <span className="flex flex-1 items-center gap-1.5 rounded-md bg-muted px-2 py-1.5">
            <CalendarDays className="h-3 w-3 text-muted-foreground" /> 14 → 16 mar
          </span>
          <span className="rounded-md bg-muted px-2 py-1.5">2 personas</span>
          <span className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 font-semibold text-primary-foreground">
            <Search className="h-3 w-3" /> Buscar
          </span>
        </div>
      </div>
      <div className="p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold">
          <Tag className="h-3 w-3 text-gold-foreground" /> Habitaciones en oferta
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            ["Doble Superior", "118 €", "98 €"],
            ["Junior Suite", "164 €", "139 €"],
          ].map(([n, was, now]) => (
            <div key={n} className="rounded-md border bg-background p-2">
              <div className="h-8 rounded bg-[linear-gradient(135deg,oklch(0.9_0.02_80),oklch(0.82_0.03_70))]" />
              <p className="mt-1.5 text-[11px] font-medium">{n}</p>
              <p className="text-[10px]">
                <span className="text-muted-foreground line-through">{was}</span>{" "}
                <span className="font-semibold text-foreground tabular-nums">{now}</span>
                <span className="text-muted-foreground"> / noche</span>
              </p>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-md border border-dashed px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
          <Globe className="h-3 w-3 shrink-0" />
          <span className="truncate">{'<script src="…/embed.js" data-hotel="hotel-mar">'}</span>
        </div>
      </div>
    </Window>
  );
}

/** Booking assistant on the hotel's website. */
export function AgentMock() {
  return (
    <Window url="reservas.hotelmar.es · Asistente">
      <div className="space-y-2.5 p-4">
        <p className="flex items-center gap-2 pb-1 text-xs font-medium">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          ¿Te ayudo a reservar?
        </p>
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

/** "Mi reserva" on the hotel's website: the guest's side of the stay. */
export function MiReservaMock() {
  return (
    <Window url="reservas.hotelmar.es/mi-reserva">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] text-muted-foreground">Reserva 7F3A91C2</p>
            <p className="text-sm font-semibold">Doble Superior · 14 → 16 mar</p>
          </div>
          <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            Confirmada
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-md border bg-background p-2">
            <p className="font-medium">Check-in online</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Datos del registro ✓ · Firma ✓</p>
          </div>
          <div className="rounded-md border bg-background p-2">
            <p className="font-medium">Cuenta de la estancia</p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">Pendiente 7,00 €</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] font-medium">Chat con recepción</p>
        <div className="mt-1.5 space-y-1.5">
          <Bubble from="guest">¿Podemos dejar la habitación a las 14:00?</Bubble>
          <Bubble from="bot">Sin problema, os lo dejamos anotado. ¡Buen viaje!</Bubble>
        </div>
      </div>
    </Window>
  );
}

/** Management copilot in the panel (read-only answers from the hotel's data). */
export function CopilotMock() {
  const bars = [62, 70, 74, 81, 93, 97, 68];
  return (
    <Window url="panel.melendo.app · Copiloto">
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
                <p className="font-mono font-semibold tabular-nums">{v}</p>
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
          <p className="mt-2 text-[10px] text-muted-foreground">
            Datos consultados: reservas y tarifas del hotel
          </p>
        </div>
      </div>
    </Window>
  );
}

/** Reports: headline KPIs and occupancy by month. */
export function ReportsMock() {
  const months = [48, 55, 63, 71, 78, 92, 97, 95, 84, 70, 58, 61];
  return (
    <Window url="panel.melendo.app/informes">
      <div className="flex">
        <PanelNav active="Informes" />
        <div className="min-w-0 flex-1 space-y-3 p-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              ["Ocupación", "73 %"],
              ["ADR", "112 €"],
              ["RevPAR", "82 €"],
              ["Directas", "41 %"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border bg-background px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground">{k}</p>
                <p className="font-mono text-sm font-semibold tabular-nums">{v}</p>
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
      </div>
    </Window>
  );
}
