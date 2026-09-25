import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, MapPin, Users, CalendarDays, Plug, Check } from "lucide-react";
import { cms } from "@/integrations/cms";
import { EVENT_CATEGORY_LABELS, accentGradient } from "@/lib/stays";
import { EventCoverArt } from "@/components/cover-art";
import type { HotelEvent } from "@/integrations/cms";

export const Route = createFileRoute("/stays/experiences")({
  component: ExperiencesScreen,
});

function ExperiencesScreen() {
  const [hotelId, setHotelId] = useState<string | null>(null);

  const { data: events, isLoading } = useQuery({
    queryKey: ["cms", "events"],
    queryFn: () => cms.listEvents({ upcomingOnly: true }),
  });

  const hotels = dedupeHotels(events ?? []);
  const visible = (events ?? []).filter((e) => (hotelId ? e.hotelId === hotelId : true));

  return (
    <div>
      <header className="px-5 pb-2 pt-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Sparkles className="h-6 w-6 text-[var(--brand)]" /> Experiencias
        </h1>
        <p className="text-sm text-neutral-500">
          Catas, rutas, spa y planes en familia en nuestros hoteles.
        </p>
        <div className="mt-2 inline-flex items-center gap-1.5  bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
          <Plug className="h-3 w-3" />
          Agenda servida por {cms.cmsName} vía API
        </div>
      </header>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 py-3">
        <Chip active={hotelId === null} onClick={() => setHotelId(null)} label="Todas" />
        {hotels.map((c) => (
          <Chip
            key={c.id}
            active={hotelId === c.id}
            onClick={() => setHotelId(c.id)}
            label={c.name}
          />
        ))}
      </div>

      <div className="space-y-4 px-5 pb-6 pt-1">
        {isLoading && (
          <p className="py-10 text-center text-sm text-neutral-400">Cargando eventos…</p>
        )}
        {visible.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
        {!isLoading && visible.length === 0 && (
          <p className="py-10 text-center text-sm text-neutral-400">No hay eventos próximos.</p>
        )}
      </div>
    </div>
  );
}

export function EventCard({ event }: { event: HotelEvent }) {
  return (
    <Link
      to="/stays/event/$eventId"
      params={{ eventId: event.id }}
      className="block overflow-hidden  bg-white shadow-sm ring-1 ring-neutral-100 transition active:scale-[0.99]"
    >
      <div
        className="relative h-24 overflow-hidden"
        style={{ background: accentGradient(event.accent) }}
      >
        <EventCoverArt category={event.category} />
        <div className="absolute inset-0 bg-black/10" />
        <span className="absolute left-3 top-3  bg-white/90 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-800">
          {EVENT_CATEGORY_LABELS[event.category]}
        </span>
        {event.going && (
          <span className="absolute right-3 top-3 flex items-center gap-1  bg-emerald-500 px-2.5 py-0.5 text-[11px] font-semibold text-white">
            <Check className="h-3 w-3" /> Voy
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-neutral-900">{event.title}</h3>
        <p className="mt-0.5 line-clamp-1 text-sm text-neutral-500">{event.summary}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" /> {formatEventDate(event.startsAt)}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {event.hotelName.replace("Demo Stays · ", "")}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {event.attending}/{event.capacity}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dedupeHotels(events: HotelEvent[]): { id: string; name: string }[] {
  const map = new Map<string, string>();
  for (const e of events) if (!map.has(e.hotelId)) map.set(e.hotelId, e.hotelName);
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0  px-4 py-2 text-sm font-medium transition ${
        active ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-200"
      }`}
    >
      {label}
    </button>
  );
}
