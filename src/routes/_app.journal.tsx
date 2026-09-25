import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { pms } from "@/integrations/pms";
import type { JournalEventType } from "@/integrations/pms";

export const Route = createFileRoute("/_app/journal")({
  component: JournalPage,
});

const EVENT_LABELS: Record<JournalEventType, string> = {
  created: "Creada",
  prebooked: "Prereserva",
  checked_out: "Check-out",
  rejected: "Pago fallido",
  no_show: "No-show",
  confirmed: "Confirmada",
  signed: "Firmada",
  checked_in: "Check-in",
  cancelled: "Cancelada",
  points_earned: "Puntos ganados",
  reward_redeemed: "Recompensa canjeada",
};

const EVENT_COLORS: Record<JournalEventType, string> = {
  created: "bg-gold/15 text-gold-foreground border-gold/40",
  prebooked: "bg-gold/15 text-gold-foreground border-gold/40",
  checked_out: "bg-muted text-muted-foreground border-border",
  rejected: "bg-red-500/10 text-red-600 border-red-500/30",
  no_show: "bg-orange-500/10 text-orange-700 border-orange-500/30",
  confirmed: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  signed: "bg-info/15 text-info-foreground border-info/40",
  checked_in: "bg-info/15 text-info-foreground border-info/40",
  cancelled: "bg-red-500/10 text-red-600 border-red-500/30",
  points_earned: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  reward_redeemed: "bg-fuchsia-500/15 text-fuchsia-700 border-fuchsia-500/30",
};

function JournalPage() {
  const [eventType, setEventType] = useState<string>("all");
  const [propertyId, setPropertyId] = useState<string>("all");

  const { data: properties } = useQuery({
    queryKey: ["pms", "properties-all"],
    queryFn: () => pms.listProperties(),
  });
  const { data: entries } = useQuery({
    queryKey: ["pms", "journal", "panel", eventType, propertyId],
    queryFn: () =>
      pms.listJournal({
        eventType: eventType === "all" ? undefined : (eventType as JournalEventType),
        propertyId: propertyId === "all" ? undefined : propertyId,
      }),
  });

  const propName = useMemo(() => {
    const m = new Map((properties ?? []).map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? (m.get(id) ?? id) : "—");
  }, [properties]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Booking journal</h1>
        <p className="text-sm text-muted-foreground">
          Traza inmutable del ciclo de vida de cada reserva (prereserva → confirmación → firma →
          check-in). Compartida con la app móvil vía el conector PMS.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={eventType} onValueChange={setEventType}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tipo de evento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los eventos</SelectItem>
            {Object.entries(EVENT_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={propertyId} onValueChange={setPropertyId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Propiedad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las propiedades</SelectItem>
            {(properties ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-2 text-left">Fecha</th>
                  <th className="p-2 text-left">Evento</th>
                  <th className="p-2 text-left">Reserva</th>
                  <th className="p-2 text-left">Propiedad</th>
                  <th className="p-2 text-left">Actor</th>
                  <th className="p-2 text-left">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {(entries ?? []).map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap p-2 text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString("es-ES", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="p-2">
                      <Badge variant="outline" className={EVENT_COLORS[e.eventType]}>
                        {EVENT_LABELS[e.eventType] ?? e.eventType}
                      </Badge>
                    </td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">{e.bookingRef}</td>
                    <td className="p-2">{propName(e.propertyId)}</td>
                    <td className="p-2 capitalize text-muted-foreground">{e.actor}</td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {Object.entries(e.payload)
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
                {entries && entries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      Sin eventos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
