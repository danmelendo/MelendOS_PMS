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
import { CancellationRequests } from "@/components/CancellationRequests";
import { PendingRefunds } from "@/components/PendingRefunds";
import { HotelAlerts } from "@/components/HotelAlerts";
import { TravellersDrawer, type StayRef } from "@/components/TravellersDrawer";
import { ymdInZone } from "@domain/dates.ts";
import { FolioDrawer } from "@/components/FolioDrawer";
import {
  ReservationExtrasInfo,
  type ReservationExtraItem,
} from "@/components/ReservationExtrasInfo";
import { Plus, LogIn, LogOut, BedDouble, Receipt } from "lucide-react";
import { toast } from "sonner";
import { useRoles } from "@/lib/roles";
import { t, currentLocale } from "@/lib/i18n";

export const Route = createFileRoute("/_app/today")({
  component: TodayPage,
});

const DAY_MS = 86_400_000;
const INACTIVE = ["cancelled", "no_show", "rejected"];

// Front-desk day view for a nightly hotel: who arrives, who leaves and who is
// in house, plus tonight's occupancy.
function TodayPage() {
  const qc = useQueryClient();
  // Group management looks, it does not operate.
  const { canOperate } = useRoles();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [folioId, setFolioId] = useState<string | null>(null);
  // Check-in waits for the traveller register when the hotel sends it to
  // SES.HOSPEDAJES: reception completes it (or sends the online link) first.
  const [checkInStay, setCheckInStay] = useState<(StayRef & { tenantId: string }) | null>(null);
  const { data: sesOn } = useQuery({
    queryKey: ["ses", "enabled"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ses_settings").select("tenant_id, enabled");
      if (error) throw error;
      return new Set((data ?? []).filter((r) => r.enabled).map((r) => r.tenant_id));
    },
    staleTime: 60_000,
  });
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
      toast.success(t("Estado actualizado"));
    },
    onError: (e: Error) => toast.error(t(e.message)),
  });

  const checkIn = useMutation({
    mutationFn: async ({ id, tenantId }: { id: string; tenantId: string }) => {
      const { error } = await supabase
        .from("reservations")
        .update({ status: "in_progress" })
        .eq("id", id);
      if (error) throw error;
      // The traveller report (PV) is queued by the check-in; send it now
      // instead of waiting for the scheduled run.
      if (sesOn?.has(tenantId)) {
        await supabase.functions.invoke("ses-dispatch", { body: { tenant_id: tenantId } });
      }
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["reservations"] });
      qc.invalidateQueries({ queryKey: ["ses"] });
      setCheckInStay(null);
      toast.success(
        sesOn?.has(v.tenantId)
          ? "Check-in hecho · parte de viajeros enviado a SES.HOSPEDAJES"
          : "Check-in hecho",
      );
    },
    onError: (e: Error) => toast.error(t(e.message)),
  });

  const startCheckIn = async (r: NonNullable<typeof stays>[number]) => {
    if (!sesOn?.has(r.tenant_id)) return checkIn.mutate({ id: r.id, tenantId: r.tenant_id });
    const { data, error } = await supabase.rpc("list_stay_travellers", { p_reservation: r.id });
    if (error) return toast.error(t(error.message));
    const rows = (data ?? []) as { missing: string[] }[];
    const complete = rows.filter((t) => t.missing.length === 0).length;
    if (complete >= r.people && complete === rows.length) {
      return checkIn.mutate({ id: r.id, tenantId: r.tenant_id });
    }
    setCheckInStay({
      id: r.id,
      tenantId: r.tenant_id,
      reference: r.reference ?? "",
      guestName: r.customers?.name ?? null,
      checkIn: ymdInZone(r.start_at, "Europe/Madrid"),
      people: r.people,
    });
  };

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
    const fmt = (d: Date) =>
      d.toLocaleDateString(currentLocale(), { day: "numeric", month: "short" });
    return (
      <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-md border bg-card p-3">
        <button
          type="button"
          className="flex min-w-[15rem] flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left"
          onClick={() => openEdit(r.id)}
        >
          <span className="font-medium">
            {r.rooms?.name}
            <span className="font-normal text-muted-foreground"> · {r.rooms?.building}</span>
          </span>
          <span className="text-sm">{r.customers?.name ?? t("Sin nombre")}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {fmt(start)} → {fmt(end)} · {nights} {nights === 1 ? t("noche") : t("noches")} ·{" "}
            {r.people} {t("pax")}
          </span>
          <Badge variant="outline" className={STATUS_COLORS[r.status]}>
            {t(STATUS_LABELS[r.status])}
          </Badge>
        </button>
        <div className="flex flex-wrap items-center gap-1">
          {r.deposit_paid ? (
            <span
              className="mr-1 text-xs text-emerald-700 dark:text-emerald-300"
              title={t("Pagado online al reservar")}
            >
              {t("pagado online")} {eur(Number(r.paid_amount))}
            </span>
          ) : (r as { payment_mode?: string }).payment_mode === "at_hotel" ? (
            <span className="mr-1 text-xs text-muted-foreground">{t("paga en el hotel")}</span>
          ) : null}
          <span className="mr-2 text-sm font-medium tabular-nums">{eur(Number(r.total))}</span>
          {r.status !== "pending" && (
            <Button size="sm" variant="ghost" onClick={() => setFolioId(r.id)}>
              <Receipt className="mr-1 h-3.5 w-3.5" /> {t("Cuenta")}
            </Button>
          )}
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
          <h1 className="text-2xl font-bold tracking-tight">{t("Hoy")}</h1>
          <p className="text-sm text-muted-foreground first-letter:uppercase">
            {today.toLocaleDateString(currentLocale(), {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        {canOperate && (
          <Button
            onClick={() => {
              setEditId(undefined);
              setOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> {t("Nueva reserva")}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label={t("Llegadas")}
          value={String(arrivals.length)}
          hint={t("{0} pendientes de check-in", { 0: pendingArrivals })}
        />
        <StatCard
          label={t("Salidas")}
          value={String(departures.length)}
          hint={t("{0} pendientes de check-out", { 0: pendingDepartures })}
        />
        <StatCard
          label={t("Alojados")}
          value={String(inHouse.length)}
          hint={t("Sin llegada ni salida hoy")}
        />
        <StatCard
          label={t("Ocupación esta noche")}
          value={`${occupancy}%`}
          hint={t("{0} de {1} habitaciones", { 0: tonight.size, 1: totalRooms })}
          accent
        />
        <StatCard
          label={t("Ingresos de llegadas")}
          value={eur(arrivals.reduce((s, r) => s + Number(r.total), 0))}
          hint={t("Total de las estancias que entran hoy")}
        />
      </div>

      <HotelAlerts />

      <CancellationRequests />

      <PendingRefunds onOpen={openEdit} />

      <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        <ListCard
          icon={<LogIn className="h-4 w-4" />}
          title={t("Llegadas")}
          empty={t("No hay llegadas hoy.")}
        >
          {arrivals.map((r) =>
            row(
              r,
              <>
                {r.status === "confirmed" && canOperate && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={checkIn.isPending}
                    onClick={() => startCheckIn(r)}
                  >
                    <LogIn className="mr-1 h-3.5 w-3.5" /> {t("Check-in")}
                  </Button>
                )}
              </>,
            ),
          )}
        </ListCard>

        <ListCard
          icon={<LogOut className="h-4 w-4" />}
          title={t("Salidas")}
          empty={t("No hay salidas hoy.")}
        >
          {departures.map((r) =>
            row(
              r,
              <>
                {r.status === "in_progress" && canOperate && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatus.mutate({ id: r.id, status: "completed" })}
                  >
                    <LogOut className="mr-1 h-3.5 w-3.5" /> {t("Check-out")}
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
        title={t("Alojados")}
        empty={t("No hay más huéspedes alojados.")}
      >
        {inHouse.map((r) => row(r, null, false))}
      </ListCard>

      <FolioDrawer reservationId={folioId} onOpenChange={(o) => !o && setFolioId(null)} />

      <TravellersDrawer
        stay={checkInStay}
        onOpenChange={(o) => !o && setCheckInStay(null)}
        checkIn={
          checkInStay
            ? {
                pending: checkIn.isPending,
                onCheckIn: () =>
                  checkIn.mutate({ id: checkInStay.id, tenantId: checkInStay.tenantId }),
              }
            : undefined
        }
      />

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
