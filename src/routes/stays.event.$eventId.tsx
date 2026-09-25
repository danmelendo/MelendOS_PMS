import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Users, CalendarDays, Check } from "lucide-react";
import { toast } from "sonner";
import { cms } from "@/integrations/cms";
import { EVENT_CATEGORY_LABELS, accentGradient } from "@/lib/stays";
import { EventCoverArt } from "@/components/cover-art";
import { formatEventDate } from "./stays.experiences";

export const Route = createFileRoute("/stays/event/$eventId")({
  component: EventScreen,
});

function EventScreen() {
  const { eventId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: event } = useQuery({
    queryKey: ["cms", "event", eventId],
    queryFn: () => cms.getEvent(eventId),
  });

  const rsvp = useMutation({
    mutationFn: (going: boolean) => cms.setRsvp(eventId, going),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["cms"] });
      toast.success(updated.going ? "¡Te has apuntado! 🎉" : "Has cancelado tu asistencia");
    },
    onError: () => toast.error("No se pudo actualizar tu asistencia"),
  });

  if (!event) return <p className="px-5 py-16 text-center text-sm text-neutral-400">Cargando…</p>;

  return (
    <div>
      <div
        className="relative h-44 overflow-hidden"
        style={{ background: accentGradient(event.accent) }}
      >
        <EventCoverArt category={event.category} />
        <div className="absolute inset-0 bg-black/15" />
        <button
          onClick={() => navigate({ to: "/stays/experiences" })}
          className="absolute left-4 top-5 flex h-9 w-9 items-center justify-center  bg-white/90 text-neutral-800"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="absolute bottom-4 left-5 right-5 text-white">
          <span className=" bg-white/90 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-800">
            {EVENT_CATEGORY_LABELS[event.category]}
          </span>
          <h1 className="mt-2 text-2xl font-semibold drop-shadow-sm">{event.title}</h1>
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="space-y-2  bg-white p-4 shadow-sm ring-1 ring-neutral-100">
          <Row icon={CalendarDays}>{formatEventDate(event.startsAt)}</Row>
          <Row icon={MapPin}>
            {event.location} · {event.hotelName}
          </Row>
          <Row icon={Users}>
            {event.attending} apuntados · {event.capacity - event.attending} plazas libres
          </Row>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-neutral-600">{event.description}</p>

        <div className="mt-5">
          {event.going ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2  bg-emerald-50 py-3 text-sm font-semibold text-emerald-700">
                <Check className="h-5 w-5" /> Estás apuntado a este evento
              </div>
              <button
                onClick={() => rsvp.mutate(false)}
                disabled={rsvp.isPending}
                className="w-full  border border-neutral-200 py-2.5 text-sm font-medium text-neutral-500"
              >
                Cancelar asistencia
              </button>
            </div>
          ) : (
            <button
              onClick={() => rsvp.mutate(true)}
              disabled={rsvp.isPending}
              className="w-full  bg-[var(--brand)] py-3.5 font-semibold text-white disabled:opacity-50"
            >
              Apuntarme
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-neutral-600">
      <Icon className="h-4 w-4 shrink-0 text-[var(--brand)]" />
      <span>{children}</span>
    </div>
  );
}
