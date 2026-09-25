import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { eur, STATUS_LABELS, STATUS_COLORS, HOTELS, buildingKey } from "@/lib/data";
import { NewReservationDialog } from "@/components/NewReservationDialog";
import {
  ReservationExtrasInfo,
  type ReservationExtraItem,
} from "@/components/ReservationExtrasInfo";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/reservations")({
  component: ReservationsPage,
});

function ReservationsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [buildingFilter, setBuildingFilter] = useState<string>("all");
  // Cancelación con motivo obligatorio: id de la reserva a cancelar + texto.
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const { data: reservations } = useQuery({
    queryKey: ["reservations", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select(
          "*, rooms(id,name,building), customers(id,name,phone), reservation_extras(qty,is_gift,extras(name,category))",
        )
        .order("start_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const cancel = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase
        .from("reservations")
        .update({ status: "cancelled", cancellation_reason: reason } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Reserva cancelada");
      qc.invalidateQueries({ queryKey: ["reservations"] });
      setCancelTarget(null);
      setCancelReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmCancel = () => {
    const reason = cancelReason.trim();
    if (!cancelTarget) return;
    if (!reason) {
      toast.error("Indica el motivo de la cancelación");
      return;
    }
    cancel.mutate({ id: cancelTarget, reason });
  };

  const filtered = reservations?.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (buildingFilter !== "all" && buildingKey(r.rooms?.building) !== buildingFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        r.customers?.name?.toLowerCase().includes(s) ||
        r.customers?.phone?.includes(s) ||
        r.rooms?.name.toLowerCase().includes(s)
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Reservas</h1>
        <Button
          onClick={() => {
            setEditId(undefined);
            setOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> Nueva
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Input
          placeholder="Buscar por nombre, teléfono o habitación"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={buildingFilter} onValueChange={setBuildingFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los hoteles</SelectItem>
            {HOTELS.map((h) => (
              <SelectItem key={h.key} value={h.key}>
                {h.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr className="text-left">
                  <th className="p-2 font-medium">Fecha</th>
                  <th className="p-2 font-medium">Habitación</th>
                  <th className="p-2 font-medium">Cliente</th>
                  <th className="p-2 font-medium">Origen</th>
                  <th className="p-2 font-medium">Estado</th>
                  <th className="p-2 font-medium text-right">Total</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered?.map((r) => {
                  const s = new Date(r.start_at);
                  const e = new Date(r.end_at);
                  const extraItems = (r as { reservation_extras?: ReservationExtraItem[] })
                    .reservation_extras;
                  const notes = (r as { internal_notes?: string | null }).internal_notes;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                        onClick={() => {
                          setEditId(r.id);
                          setOpen(true);
                        }}
                      >
                        <td className="p-2">
                          <div>{s.toLocaleDateString("es-ES")}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {s.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}–
                            {e.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </td>
                        <td className="p-2">
                          {r.rooms?.building} · {r.rooms?.name}
                        </td>
                        <td className="p-2">
                          <div>{r.customers?.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.customers?.phone ?? ""}
                          </div>
                        </td>
                        <td className="p-2">
                          {(() => {
                            const role = (r as { created_by_role?: string | null }).created_by_role;
                            const map: Record<string, { label: string; cls: string }> = {
                              admin: {
                                label: "Admin",
                                cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
                              },
                              reception: {
                                label: "Recepción",
                                cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
                              },
                              public: {
                                label: "Web pública",
                                cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
                              },
                            };
                            const info = role ? map[role] : null;
                            return info ? (
                              <Badge variant="outline" className={info.cls}>
                                {info.label}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            );
                          })()}
                        </td>
                        <td className="p-2">
                          <Badge variant="outline" className={STATUS_COLORS[r.status]}>
                            {STATUS_LABELS[r.status]}
                          </Badge>
                          {(() => {
                            const reason = (r as { cancellation_reason?: string | null })
                              .cancellation_reason;
                            return (r.status === "cancelled" || r.status === "rejected") &&
                              reason ? (
                              <div className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                                {reason}
                              </div>
                            ) : null;
                          })()}
                        </td>
                        <td className="p-2 text-right font-medium tabular-nums">
                          {eur(Number(r.total))}
                          {/* Reservas de web pública: importe realmente cobrado al
                            TPV (depósito, ya con descuentos/promos aplicados). */}
                          {r.created_by_role === "public" && r.deposit_paid && (
                            <div className="text-xs font-normal text-emerald-700 dark:text-emerald-300">
                              Pagado web: {eur(Number(r.paid_amount))}
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {r.status !== "cancelled" &&
                            r.status !== "rejected" &&
                            r.status !== "completed" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCancelReason("");
                                  setCancelTarget(r.id);
                                }}
                                title="Cancelar"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                        </td>
                      </tr>
                      {extraItems?.length || notes?.trim() ? (
                        <tr className="border-b last:border-0 bg-muted/10">
                          <td colSpan={7} className="px-2 pb-2 pt-0">
                            <ReservationExtrasInfo items={extraItems} notes={notes} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
                {!filtered?.length && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Sin reservas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <NewReservationDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditId(undefined);
        }}
        editReservationId={editId}
      />

      <Dialog
        open={!!cancelTarget}
        onOpenChange={(o) => {
          if (!o) {
            setCancelTarget(null);
            setCancelReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar reserva</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">
              Motivo de la cancelación <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="cancel-reason"
              rows={3}
              autoFocus
              placeholder="Ej. El cliente llamó para anular, habitación con avería, no se presentó…"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Obligatorio. Quedará registrado junto a la reserva.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelTarget(null);
                setCancelReason("");
              }}
            >
              Volver
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancel}
              disabled={!cancelReason.trim() || cancel.isPending}
            >
              {cancel.isPending ? "Cancelando…" : "Confirmar cancelación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
