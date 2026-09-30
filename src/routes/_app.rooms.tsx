import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRooms, type Room, HOTELS, buildingKey } from "@/lib/data";
import { useRoles } from "@/lib/roles";
import { Navigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Pencil, Check, X, ChevronUp, ChevronDown, Info } from "lucide-react";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/_app/rooms")({
  component: RoomsPage,
});

const STATUS_LABELS: Record<string, string> = {
  available: "Disponible",
  occupied: "Ocupada",
  cleaning: "Limpieza",
  out_of_service: "Fuera de servicio",
};
const STATUS_STYLES: Record<string, string> = {
  available: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  occupied: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  cleaning: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  out_of_service: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
};

function RoomsPage() {
  const { isAdmin, loading: rolesLoading } = useRoles();
  const { data: rooms } = useRooms();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // Habitaciones con una reserva en curso (check-in realizado) se muestran como
  // ocupadas, independientemente de su estado manual. Solo cuentan las reservas
  // cuyo horario sigue vigente (end_at en el futuro): el paso in_progress →
  // completed es manual, así que una reserva a la que recepción olvidó dar
  // "Finalizar" quedaría in_progress para siempre y marcaría la habitación como
  // ocupada aunque ya esté libre. Filtrando por end_at evitamos ese falso "en curso".
  const { data: inProgressRoomIds } = useQuery({
    queryKey: ["rooms", "in_progress_room_ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("room_id")
        .eq("status", "in_progress")
        .gt("end_at", new Date().toISOString());
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.room_id as string));
    },
    refetchInterval: 30_000,
  });
  const occupiedRoomIds = inProgressRoomIds ?? new Set<string>();

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("rooms")
        .update({ status: status as never })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rooms"] });
      toast.success(t("Estado actualizado"));
    },
  });

  const updateName = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("rooms").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rooms"] });
      toast.success(t("Nombre actualizado"));
      setEditingId(null);
    },
    onError: (e: Error) => toast.error(t(e.message)),
  });

  const swapOrder = useMutation({
    mutationFn: async ({ a, b }: { a: Room; b: Room }) => {
      const { error: e1 } = await supabase
        .from("rooms")
        .update({ sort_order: b.sort_order })
        .eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("rooms")
        .update({ sort_order: a.sort_order })
        .eq("id", b.id);
      if (e2) throw e2;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rooms"] }),
    onError: (e: Error) => toast.error(t(e.message)),
  });

  const startEdit = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const confirmEdit = (id: string) => {
    const name = editingName.trim();
    if (!name) return toast.error(t("El nombre no puede estar vacío"));
    updateName.mutate({ id, name });
  };

  const cancelEdit = () => setEditingId(null);

  if (rolesLoading) return null;
  if (!isAdmin) return <Navigate to="/today" />;

  const buildings = Array.from(new Set(rooms?.map((r) => r.building) ?? []));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("Habitaciones")}</h1>
        <p className="text-sm text-muted-foreground">{t("Estado y catálogo del hotel")}</p>
      </div>

      {buildings.map((b) => {
        const buildingRooms = rooms?.filter((r) => r.building === b) ?? [];
        return (
          <div key={b} className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {HOTELS.find((h) => h.key === buildingKey(b))?.label ?? b}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {buildingRooms.map((r, i) => {
                const autoOccupied = occupiedRoomIds.has(r.id);
                const displayStatus = autoOccupied ? "occupied" : r.status;
                return (
                  <Card key={r.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">
                        {editingId === r.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              className="h-7 text-sm font-semibold px-2 flex-1"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") confirmEdit(r.id);
                                if (e.key === "Escape") cancelEdit();
                              }}
                              autoFocus
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-emerald-600"
                              onClick={() => confirmEdit(r.id)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              onClick={cancelEdit}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{r.name}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                disabled={i === 0 || swapOrder.isPending}
                                title={t("Subir")}
                                onClick={() => swapOrder.mutate({ a: r, b: buildingRooms[i - 1] })}
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                disabled={i === buildingRooms.length - 1 || swapOrder.isPending}
                                title={t("Bajar")}
                                onClick={() => swapOrder.mutate({ a: r, b: buildingRooms[i + 1] })}
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                onClick={() => startEdit(r.id, r.name)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {t("Capacidad")} {r.capacity}
                        </span>
                        <span>·</span>
                        <span>
                          {(r as { rate_groups?: { name: string } | null }).rate_groups?.name ??
                            t("Sin tarifa")}
                        </span>
                      </div>
                      <Badge variant="outline" className={STATUS_STYLES[displayStatus]}>
                        {t(STATUS_LABELS[displayStatus])}
                      </Badge>
                      {autoOccupied && (
                        <p className="flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-300">
                          <Info className="h-3.5 w-3.5 shrink-0" />

                          {t("Reserva en curso (check-in realizado)")}
                        </p>
                      )}
                      {/* When a reservation is in progress the room is occupied by an
                      active guest, so we show that effective status and lock the
                      manual selector until checkout — otherwise it would
                      contradictorily read "Disponible" while occupied. */}
                      <Select
                        value={displayStatus}
                        disabled={autoOccupied}
                        onValueChange={(v) => updateStatus.mutate({ id: r.id, status: v })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>
                              {t(v)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
