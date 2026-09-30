import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRooms, STATUS_COLORS, STATUS_LABELS } from "@/lib/data";
import { useStaffHotels } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { NewReservationDialog } from "@/components/NewReservationDialog";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useRoles } from "@/lib/roles";
import { t, currentLocale } from "@/lib/i18n";

export const Route = createFileRoute("/_app/calendar")({
  component: CalendarPage,
});

// Hotel planning ("tape chart"): one row per room, one column per night. A stay
// is drawn from the middle of its arrival day to the middle of its departure
// day, so back-to-back stays (check-out 12:00, check-in 15:00) share a cell
// without overlapping, as on a front-desk planning board.
const DAYS = 14;
// Day columns share the width available (never narrower than MIN_DAY_W; below
// that the board scrolls sideways).
const MIN_DAY_W = 64;
const ROOM_COL_W = 176; // px, sticky room label column
const ROW_H = 44; // px per room row
const DAY_MS = 86_400_000;

function startOfDay(d: Date) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function CalendarPage() {
  const { data: rooms } = useRooms();
  const { canOperate } = useRoles();
  const [from, setFrom] = useState(() => {
    // Open with yesterday visible so in-house stays show where they started.
    const d = startOfDay(new Date());
    d.setDate(d.getDate() - 1);
    return d;
  });
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [defaults, setDefaults] = useState<{ start?: Date; roomId?: string }>({});
  const [buildingFilter, setBuildingFilter] = useState<string>("all");
  // Only people with more than one hotel choose which one to see.
  const { data: hotels } = useStaffHotels();
  const board = useRef<HTMLDivElement>(null);
  const [dayW, setDayW] = useState(MIN_DAY_W);
  useLayoutEffect(() => {
    const el = board.current;
    if (!el) return;
    const fit = () =>
      setDayW(Math.max(MIN_DAY_W, Math.floor((el.clientWidth - ROOM_COL_W) / DAYS)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const to = useMemo(() => new Date(from.getTime() + DAYS * DAY_MS), [from]);
  const days = useMemo(
    () =>
      Array.from({ length: DAYS }, (_, i) => {
        const d = new Date(from);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [from],
  );
  const todayKey = startOfDay(new Date()).getTime();

  const visibleRooms = rooms?.filter(
    (r) => buildingFilter === "all" || r.tenant_id === buildingFilter,
  );

  const { data: reservations } = useQuery({
    queryKey: ["reservations", "planning", from.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("*, customers(name,phone)")
        .lt("start_at", to.toISOString())
        .gt("end_at", from.toISOString());
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  const shift = (deltaDays: number) => {
    const d = new Date(from);
    d.setDate(d.getDate() + deltaDays);
    setFrom(d);
  };

  // Horizontal position (px) of a timestamp: whole days since `from`, plus half a
  // day so arrivals/departures land mid-cell.
  const xOf = (iso: string) =>
    ((startOfDay(new Date(iso)).getTime() - from.getTime()) / DAY_MS + 0.5) * dayW;

  const rangeLabel = `${from.toLocaleDateString(currentLocale(), { day: "numeric", month: "short" })} – ${new Date(
    to.getTime() - DAY_MS,
  ).toLocaleDateString(currentLocale(), { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => shift(-7)}
            aria-label={t("Semana anterior")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const d = startOfDay(new Date());
              d.setDate(d.getDate() - 1);
              setFrom(d);
            }}
          >
            {t("Hoy")}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => shift(7)}
            aria-label={t("Semana siguiente")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="ml-2">
            <h1 className="text-xl font-semibold leading-tight">{t("Planning")}</h1>
            <p className="text-xs text-muted-foreground">{rangeLabel}</p>
          </div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {hotels && hotels.length > 1 && (
            <Select value={buildingFilter} onValueChange={setBuildingFilter}>
              <SelectTrigger className="min-w-0 flex-1 sm:w-44 sm:flex-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("Todos los hoteles")}</SelectItem>
                {hotels.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {canOperate && (
            <Button
              onClick={() => {
                setEditId(undefined);
                setDefaults({ start: startOfDay(new Date()) });
                setOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> {t("Nueva reserva")}
            </Button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent ref={board} className="p-0 overflow-x-auto">
          <div style={{ width: ROOM_COL_W + DAYS * dayW }}>
            {/* Day header */}
            <div className="flex border-b bg-muted/40">
              <div
                className="sticky left-0 z-20 shrink-0 border-r bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground backdrop-blur"
                style={{ width: ROOM_COL_W }}
              >
                {t("Habitación")}
              </div>
              {days.map((d) => {
                const isToday = d.getTime() === todayKey;
                const weekend = d.getDay() === 5 || d.getDay() === 6;
                return (
                  <div
                    key={d.getTime()}
                    className={cn(
                      "shrink-0 border-r py-1.5 text-center text-[11px] leading-tight",
                      weekend && "bg-info/10",
                      isToday && "bg-gold/20 font-semibold text-foreground",
                    )}
                    style={{ width: dayW }}
                  >
                    <div className="uppercase text-muted-foreground">
                      {d.toLocaleDateString(currentLocale(), { weekday: "short" }).replace(".", "")}
                    </div>
                    <div className="text-sm tabular-nums">{d.getDate()}</div>
                  </div>
                );
              })}
            </div>

            {/* Room rows */}
            {visibleRooms?.map((room) => {
              const stays =
                reservations?.filter(
                  (r) =>
                    r.room_id === room.id &&
                    r.status !== "cancelled" &&
                    r.status !== "no_show" &&
                    r.status !== "rejected",
                ) ?? [];
              return (
                <div key={room.id} className="flex border-b last:border-b-0 group/row">
                  <div
                    className="sticky left-0 z-10 shrink-0 border-r bg-card px-3 flex flex-col justify-center group-hover/row:bg-muted/40"
                    style={{ width: ROOM_COL_W, height: ROW_H }}
                    title={`${room.building} · ${room.name}`}
                  >
                    <div className="truncate text-sm font-medium">{room.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {room.building}
                      {(room as { rate_groups?: { name: string } | null }).rate_groups?.name
                        ? ` · ${(room as { rate_groups?: { name: string } | null }).rate_groups?.name}`
                        : ""}
                    </div>
                  </div>
                  <div className="relative" style={{ width: DAYS * dayW, height: ROW_H }}>
                    {/* Clickable day cells */}
                    {days.map((d, i) => {
                      const isToday = d.getTime() === todayKey;
                      const weekend = d.getDay() === 5 || d.getDay() === 6;
                      return (
                        <button
                          type="button"
                          key={d.getTime()}
                          aria-label={t("Nueva reserva en {0} el {1}", {
                            0: room.name,
                            1: d.toLocaleDateString(currentLocale()),
                          })}
                          disabled={!canOperate}
                          className={cn(
                            "absolute top-0 h-full border-r border-border/60 transition-colors hover:bg-primary/5",
                            weekend && "bg-info/5",
                            isToday && "bg-gold/10",
                          )}
                          style={{ left: i * dayW, width: dayW }}
                          onClick={() => {
                            setEditId(undefined);
                            setDefaults({ start: d, roomId: room.id });
                            setOpen(true);
                          }}
                        />
                      );
                    })}
                    {/* Stays */}
                    {stays.map((r) => {
                      const left = Math.max(0, xOf(r.start_at));
                      const right = Math.min(DAYS * dayW, xOf(r.end_at));
                      if (right <= 0 || left >= DAYS * dayW || right - left <= 0) return null;
                      const nights = Math.max(
                        1,
                        Math.round(
                          (new Date(r.end_at).getTime() - new Date(r.start_at).getTime()) / DAY_MS,
                        ),
                      );
                      return (
                        <button
                          type="button"
                          key={r.id}
                          className={cn(
                            "absolute top-1.5 bottom-1.5 z-[5] overflow-hidden rounded-md border px-2 text-left text-[11px] leading-tight shadow-sm transition-shadow hover:shadow-md",
                            STATUS_COLORS[r.status],
                          )}
                          style={{ left: left + 2, width: right - left - 4 }}
                          title={`${r.customers?.name ?? "Sin nombre"} · ${nights} ${nights === 1 ? "noche" : "noches"} · ${STATUS_LABELS[r.status] ?? r.status}${r.internal_notes ? ` · ${r.internal_notes}` : ""}`}
                          onClick={() => {
                            setEditId(r.id);
                            setDefaults({});
                            setOpen(true);
                          }}
                        >
                          <div className="truncate font-medium">
                            {r.customers?.name ?? t("Sin nombre")}
                          </div>
                          <div className="truncate opacity-80">
                            {nights} {nights === 1 ? t("noche") : t("noches")}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {(["pending", "confirmed", "in_progress", "completed"] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn("h-3 w-5 rounded-sm border", STATUS_COLORS[s])} />
            {t(STATUS_LABELS[s])}
          </span>
        ))}
        <span className="ml-auto">{t("Pulsa una celda libre para crear una reserva.")}</span>
      </div>

      <NewReservationDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditId(undefined);
        }}
        defaultStart={defaults.start}
        defaultRoomId={defaults.roomId}
        editReservationId={editId}
      />
    </div>
  );
}
