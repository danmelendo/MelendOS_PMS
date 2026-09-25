import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Users, CalendarDays, Check, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { cms } from "@/integrations/cms";
import { EVENT_CATEGORY_LABELS, EVENT_CATEGORY_CLASSES, accentGradient } from "@/lib/stays";

export const Route = createFileRoute("/web/event/$eventId")({
  component: WebEventDetail,
});

function WebEventDetail() {
  const { eventId } = Route.useParams();
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

  if (!event) return <p className="py-20 text-center text-sm text-neutral-400">Cargando…</p>;

  return (
    <div>
      {/* Hero */}
      <div
        className="relative h-56 overflow-hidden sm:h-72"
        style={{ background: accentGradient(event.accent) }}
      >
        <div className="absolute inset-0 flex items-center justify-center opacity-20">
          <PartyPopper className="h-48 w-48 text-white" />
        </div>
        <div className="absolute inset-0 bg-black/25" />
        <Link
          to="/web/events"
          className="absolute left-5 top-5 flex h-10 w-10 items-center justify-center  bg-white/90 text-neutral-800"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="absolute bottom-6 left-0 right-0">
          <div className="mx-auto max-w-4xl px-5 text-white">
            <span
              className={`inline-block  px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${EVENT_CATEGORY_CLASSES[event.category]}`}
            >
              {EVENT_CATEGORY_LABELS[event.category]}
            </span>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{event.title}</h1>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-5 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left: details */}
          <div className="lg:col-span-2 space-y-6">
            <div className=" bg-white p-5 shadow-sm ring-1 ring-neutral-100 space-y-3">
              <div className="flex items-center gap-2 text-sm text-neutral-700">
                <CalendarDays className="h-4 w-4 text-[var(--brand)] shrink-0" />
                {new Date(event.startsAt).toLocaleString("es-ES", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              <div className="flex items-center gap-2 text-sm text-neutral-700">
                <MapPin className="h-4 w-4 text-[var(--brand)] shrink-0" />
                {event.location} · {event.hotelName}
              </div>
              <div className="flex items-center gap-2 text-sm text-neutral-700">
                <Users className="h-4 w-4 text-[var(--brand)] shrink-0" />
                {event.attending} apuntados · {event.capacity - event.attending} plazas libres
              </div>
            </div>

            <div>
              <h2 className="text-lg font-bold">Sobre el evento</h2>
              <p className="mt-2 leading-relaxed text-neutral-600">{event.description}</p>
            </div>
          </div>

          {/* Right: RSVP */}
          <div>
            <div className=" bg-white p-6 shadow-md ring-1 ring-neutral-200 sticky top-20">
              <div className="mb-4 flex items-center justify-between text-sm text-neutral-500">
                <span>
                  {event.attending}/{event.capacity} apuntados
                </span>
                <span
                  className={`font-semibold ${event.capacity - event.attending > 0 ? "text-emerald-600" : "text-rose-600"}`}
                >
                  {event.capacity - event.attending > 0
                    ? `${event.capacity - event.attending} plazas`
                    : "Sin plazas"}
                </span>
              </div>
              <div className="mb-4 h-2 overflow-hidden  bg-neutral-100">
                <div
                  className="h-full bg-[var(--brand)]"
                  style={{ width: `${Math.min(100, (event.attending / event.capacity) * 100)}%` }}
                />
              </div>

              {event.going ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2  bg-emerald-50 py-3 text-sm font-semibold text-emerald-700">
                    <Check className="h-5 w-5" /> Estás apuntado
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
                  disabled={rsvp.isPending || event.capacity - event.attending <= 0}
                  className="w-full  bg-[var(--brand)] py-3.5 font-semibold text-white disabled:opacity-50"
                >
                  {rsvp.isPending ? "Apuntándote…" : "Apuntarme"}
                </button>
              )}

              <Link
                to="/web/events"
                className="mt-4 block text-center text-xs text-neutral-400 underline"
              >
                Ver todos los eventos
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
