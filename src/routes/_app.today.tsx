import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { eur, STATUS_LABELS, STATUS_COLORS, useRooms } from "@/lib/data";
import { NewReservationDialog } from "@/components/NewReservationDialog";
import { ExtendCleaningButton } from "@/components/ExtendCleaningButton";
import {
  ReservationExtrasInfo,
  type ReservationExtraItem,
} from "@/components/ReservationExtrasInfo";
import { Plus, LogIn, LogOut, BedDouble } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/today")({
  component: TodayPage,
});

const DAY_MS = 86_400_000;
const INACTIVE = ["cancelled", "no_show", "rejected"];

// Front-desk day view for a nightly hotel: who arrives, who leaves and who is
// in house, plus tonight's occupancy.
function TodayPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const { data: rooms } = useRooms();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + DAY_MS);

  // Every stay that touches today: arrives, leaves or spans it.
  const { data: stays } = useQuery({
    queryKey: ["reservations", "today"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select(
          "*, rooms(id,name,building), customers(id,name,phone), reservation_extras(qty,is_gift,extras(name,category))",
        )
        .lt("start_at", tomorrow.toISOString())
        .gte("end_at", today.toISOString())
        .order("start_at");
      if (error) throw error;
      return (data ?? []).filter((r) => !INACTIVE.includes(r.status));
    },
    refetchInterval: 30_000,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("reservations")
        .update({ status: status as never })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("Estado actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inDay = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= today.getTime() && t < tomorrow.getTime();
  };
  const arrivals = stays?.filter((r) => inDay(r.start_at)) ?? [];
  const departures = stays?.filter((r) => inDay(r.end_at)) ?? [];
  const inHouse =
    stays?.filter((r) => r.status === "in_progress" && !inDay(r.end_at) && !inDay(r.start_at)) ??
    [];
  // Rooms occupied tonight: stays that have started by today and leave after today.
  const tonight = new Set(
    stays
      ?.filter((r) => new Date(r.end_at).getTime() >= tomorrow.getTime() && r.status !== "pending")
      .map((r) => r.room_id),
  );
  const totalRooms = rooms?.filter((r) => r.active).length ?? 0;
  const occupancy = totalRooms ? Math.round((tonight.size / totalRooms) * 100) : 0;
  const pendingArrivals = arrivals.filter((r) => r.status === "confirmed").length;
  const pendingDepartures = departures.filter((r) => r.status === "in_progress").length;

  const openEdit = (id: string) => {
    setEditId(id);
    setOpen(true);
  };

  const row = (r: NonNullable<typeof stays>[number], action: ReactNode, showExtras = true) => {
    const start = new Date(r.start_at);
    const end = new Date(r.end_at);
    const nights = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
    const fmt = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    return (
      <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-md border bg-card p-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left"
          onClick={() => openEdit(r.id)}
        >
          <span className="font-medium">
            {r.rooms?.name}
            <span className="font-normal text-muted-foreground"> · {r.rooms?.building}</span>
          </span>
          <span className="text-sm">{r.customers?.name ?? "Sin nombre"}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {fmt(start)} → {fmt(end)} · {nights} {nights === 1 ? "noche" : "noches"} · {r.people}{" "}
            pax
          </span>
          <Badge variant="outline" className={STATUS_COLORS[r.status]}>
            {STATUS_LABELS[r.status]}
          </Badge>
        </button>
        <div className="flex flex-wrap items-center gap-1">
          {r.created_by_role === "public" && r.deposit_paid && (
            <span
              className="mr-1 text-xs text-emerald-700 dark:text-emerald-300"
              title="Señal pagada online"
            >
              señal {eur(Number(r.paid_amount))}
            </span>
          )}
          <span className="mr-2 text-sm font-medium tabular-nums">{eur(Number(r.total))}</span>
          {action}
        </div>
        {showExtras && (
          <ReservationExtrasInfo
            items={(r as { reservation_extras?: ReservationExtraItem[] }).reservation_extras}
            notes={(r as { internal_notes?: string | null }).internal_notes}
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hoy</h1>
          <p className="text-sm text-muted-foreground first-letter:uppercase">
            {today.toLocaleDateString("es-ES", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditId(undefined);
            setOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> Nueva reserva
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Llegadas"
          value={String(arrivals.length)}
          hint={`${pendingArrivals} pendientes de check-in`}
        />
        <StatCard
          label="Salidas"
          value={String(departures.length)}
          hint={`${pendingDepartures} pendientes de check-out`}
        />
        <StatCard
          label="Alojados"
          value={String(inHouse.length)}
          hint="Sin llegada ni salida hoy"
        />
        <StatCard
          label="Ocupación esta noche"
          value={`${occupancy}%`}
          hint={`${tonight.size} de ${totalRooms} habitaciones`}
          accent
        />
        <StatCard
          label="Ingresos de llegadas"
          value={eur(arrivals.reduce((s, r) => s + Number(r.total), 0))}
          hint="Total de las estancias que entran hoy"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        <ListCard
          icon={<LogIn className="h-4 w-4" />}
          title="Llegadas"
          empty="No hay llegadas hoy."
        >
          {arrivals.map((r) =>
            row(
              r,
              <>
                {r.status === "confirmed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatus.mutate({ id: r.id, status: "in_progress" })}
                  >
                    <LogIn className="mr-1 h-3.5 w-3.5" /> Check-in
                  </Button>
                )}
              </>,
            ),
          )}
        </ListCard>

        <ListCard icon={<LogOut className="h-4 w-4" />} title="Salidas" empty="No hay salidas hoy.">
          {departures.map((r) =>
            row(
              r,
              <>
                {r.status === "in_progress" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatus.mutate({ id: r.id, status: "completed" })}
                  >
                    <LogOut className="mr-1 h-3.5 w-3.5" /> Check-out
                  </Button>
                )}
                <ExtendCleaningButton
                  reservationId={r.id}
                  currentCleaning={(r as { cleaning_minutes?: number }).cleaning_minutes ?? 15}
                />
              </>,
              false,
            ),
          )}
        </ListCard>
      </div>

      <ListCard
        icon={<BedDouble className="h-4 w-4" />}
        title="Alojados"
        empty="No hay más huéspedes alojados."
      >
        {inHouse.map((r) => row(r, null, false))}
      </ListCard>

      <NewReservationDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditId(undefined);
        }}
        editReservationId={editId}
      />
    </div>
  );
}

function ListCard({
  icon,
  title,
  empty,
  children,
}: {
  icon: ReactNode;
  title: string;
  empty: string;
  children: ReactNode[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon} {title}
          <span className="text-sm font-normal text-muted-foreground">({children.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {children.length ? (
          children
        ) : (
          <div className="py-4 text-sm text-muted-foreground">{empty}</div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "border-gold/50" : undefined}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={
            accent
              ? "mt-1 text-2xl font-bold tabular-nums text-gold-foreground"
              : "mt-1 text-2xl font-bold tabular-nums"
          }
        >
          {value}
        </div>
        {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
