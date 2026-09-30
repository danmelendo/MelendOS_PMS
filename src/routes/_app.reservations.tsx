import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useState } from "react";
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
import { eur, STATUS_LABELS, STATUS_COLORS, useRooms } from "@/lib/data";
import { useStaffHotels } from "@/lib/reports";
import { ColumnMenu, DateBoundsFilter, ValuesFilter, type SortDir } from "@/components/ColumnMenu";
import {
  CANCELLATION_CATEGORIES,
  isCancellationCategory,
  type CancellationCategory,
} from "@domain/cancellations.ts";

// Reasons reception can pick (the payment one is set by the system).
const STAFF_CATEGORIES = (Object.keys(CANCELLATION_CATEGORIES) as CancellationCategory[]).filter(
  (c) => c !== "payment_not_completed",
);
import { NewReservationDialog } from "@/components/NewReservationDialog";
import {
  ReservationExtrasInfo,
  type ReservationExtraItem,
} from "@/components/ReservationExtrasInfo";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useRoles } from "@/lib/roles";
import { t, currentLocale } from "@/lib/i18n";

// Where a booking came from (created_by_role).
const ORIGINS: Record<string, { label: string; cls: string }> = {
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
  member: { label: "App", cls: "bg-info/10 text-info border-info/30" },
  agent: { label: "Asistente IA", cls: "bg-info/10 text-info border-info/30" },
  mcp: { label: "MCP", cls: "bg-info/10 text-info border-info/30" },
  ota: { label: "OTA", cls: "bg-gold/15 text-gold border-gold/40" },
  tour_operator: { label: "Touroperador", cls: "bg-gold/15 text-gold border-gold/40" },
  import: { label: "Importada", cls: "bg-muted text-muted-foreground border-border" },
};
const NO_ORIGIN = "none";

type SortCol = "start_at" | "end_at" | "total" | "created_at";
type Bounds = { from: string; to: string };
const NO_BOUNDS: Bounds = { from: "", to: "" };
const LIMIT = 200;

/** Day after a yyyy-MM-dd date (for "to" bounds, inclusive of the whole day). */
function nextDay(ymd: string) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const DATE_FMT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
const DAY_MS = 86_400_000;

export const Route = createFileRoute("/_app/reservations")({
  component: ReservationsPage,
});

function ReservationsPage() {
  const qc = useQueryClient();
  const { canOperate } = useRoles();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  // Spreadsheet-style column menus: sort by one column, filter by several.
  // Everything is applied in the database, over every booking, not just the
  // rows already loaded.
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({
    col: "start_at",
    dir: "desc",
  });
  const [statuses, setStatuses] = useState<string[]>([]);
  const [origins, setOrigins] = useState<string[]>([]);
  const [hotels, setHotels] = useState<string[]>([]);
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [arrival, setArrival] = useState<Bounds>(NO_BOUNDS);
  const [departure, setDeparture] = useState<Bounds>(NO_BOUNDS);
  const { data: staffHotels } = useStaffHotels();
  const { data: rooms } = useRooms();
  // Only people with more than one hotel (group management, Melend/OS support)
  // see and filter by hotel.
  const multiHotel = (staffHotels?.length ?? 0) > 1;
  const hotelName = new Map((staffHotels ?? []).map((h) => [h.id, h.name]));
  const filters = { statuses, origins, hotels, roomIds, arrival, departure };
  const filtering =
    statuses.length +
      origins.length +
      hotels.length +
      roomIds.length +
      [arrival.from, arrival.to, departure.from, departure.to].filter(Boolean).length >
    0;
  const clearFilters = () => {
    setStatuses([]);
    setOrigins([]);
    setHotels([]);
    setRoomIds([]);
    setArrival(NO_BOUNDS);
    setDeparture(NO_BOUNDS);
  };
  const sortOf = (col: SortCol) => (sort.col === col ? sort.dir : undefined);
  const sortBy = (col: SortCol) => (dir: SortDir) => setSort({ col, dir });
  // Cancellation: a reason group (required, for reports and the ML models)
  // and an optional internal note.
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelCategory, setCancelCategory] = useState<CancellationCategory | "">("");
  const [cancelNote, setCancelNote] = useState("");
  const closeCancel = () => {
    setCancelTarget(null);
    setCancelCategory("");
    setCancelNote("");
  };

  // Search in the database, over every booking: by reference (also partial,
  // e.g. what a guest reads out on the phone), name, email or phone.
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const { data: reservations } = useQuery({
    queryKey: ["reservations", "list", query, sort, filters],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const cols =
        "*, rooms(id,name,building), customers(id,name,phone,email), channels(name), reservation_extras(qty,is_gift,extras(name,category))";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const narrow = <Q extends Record<string, any>>(q: Q): Q => {
        if (statuses.length) q = q.in("status", statuses);
        if (hotels.length) q = q.in("tenant_id", hotels);
        if (roomIds.length) q = q.in("room_id", roomIds);
        if (origins.length) {
          const named = origins.filter((o) => o !== NO_ORIGIN);
          const parts = [
            ...(named.length ? [`created_by_role.in.(${named.join(",")})`] : []),
            ...(origins.includes(NO_ORIGIN) ? ["created_by_role.is.null"] : []),
          ];
          q = q.or(parts.join(","));
        }
        if (arrival.from) q = q.gte("start_at", arrival.from);
        if (arrival.to) q = q.lt("start_at", nextDay(arrival.to));
        if (departure.from) q = q.gte("end_at", departure.from);
        if (departure.to) q = q.lt("end_at", nextDay(departure.to));
        return q.order(sort.col, { ascending: sort.dir === "asc" });
      };
      if (!query) {
        const { data, error } = await narrow(supabase.from("reservations").select(cols)).limit(
          LIMIT,
        );
        if (error) throw error;
        return data;
      }
      const like = `%${query.replace(/[%_,()]/g, "")}%`;
      const [byRef, byGuest, byRoom] = await Promise.all([
        narrow(
          supabase
            .from("reservations")
            .select(cols)
            .ilike("reference", `${query.replace(/[^0-9a-f]/gi, "").toUpperCase()}%`),
        ).limit(50),
        narrow(
          supabase
            .from("reservations")
            .select(cols.replace("customers(", "customers!inner("))
            .or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`, {
              referencedTable: "customers",
            }),
        ).limit(100),
        narrow(
          supabase
            .from("reservations")
            .select(cols.replace("rooms(", "rooms!inner("))
            .ilike("rooms.name", like),
        ).limit(100),
      ]);
      const error = byRef.error ?? byGuest.error ?? byRoom.error;
      if (error) throw error;
      const seen = new Map<string, NonNullable<typeof byRef.data>[number]>();
      for (const r of [
        ...(/[0-9a-f]{3,}/i.test(query) ? (byRef.data ?? []) : []),
        ...((byGuest.data ?? []) as typeof byRef.data & object),
        ...((byRoom.data ?? []) as typeof byRef.data & object),
      ]) {
        seen.set(r.id, r);
      }
      const sign = sort.dir === "asc" ? 1 : -1;
      return [...seen.values()].sort((a, b) => {
        const [x, y] = [a[sort.col], b[sort.col]];
        return (
          sign *
          (typeof x === "number" && typeof y === "number"
            ? x - y
            : String(x).localeCompare(String(y)))
        );
      });
    },
  });

  const cancel = useMutation({
    mutationFn: async (v: { id: string; category: CancellationCategory; note: string }) => {
      const { error } = await supabase
        .from("reservations")
        .update({
          status: "cancelled",
          cancellation_reason: CANCELLATION_CATEGORIES[v.category],
          cancellation_category: v.category,
          cancellation_note: v.note || null,
        })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Reserva cancelada"));
      qc.invalidateQueries({ queryKey: ["reservations"] });
      closeCancel();
    },
    onError: (e: Error) => toast.error(t(e.message)),
  });

  const confirmCancel = () => {
    if (!cancelTarget) return;
    if (!cancelCategory) {
      toast.error(t("Elige el motivo de la cancelación"));
      return;
    }
    cancel.mutate({ id: cancelTarget, category: cancelCategory, note: cancelNote.trim() });
  };

  const filtered = reservations;
  const roomOptions = (rooms ?? [])
    .filter((r) => !hotels.length || hotels.includes(r.tenant_id))
    .map((r) => ({
      value: r.id,
      label: multiHotel ? `${r.name} · ${hotelName.get(r.tenant_id) ?? ""}` : r.name,
    }));
  const cols = multiHotel ? 10 : 9;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t("Reservas")}</h1>
        {canOperate && (
          <Button
            onClick={() => {
              setEditId(undefined);
              setOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> {t("Nueva")}
          </Button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <Input
          placeholder={t("Buscar por referencia, nombre, email, teléfono o habitación")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {filtering && (
          <Button variant="ghost" onClick={clearFilters}>
            <X className="mr-1 h-4 w-4" /> {t("Quitar filtros")}
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr className="text-left">
                  <th className="p-2 font-medium">
                    <ColumnMenu
                      label={t("Referencia")}
                      sort={sortOf("created_at")}
                      sortLabels={["Reservadas antes primero", "Reservadas después primero"]}
                      onSort={sortBy("created_at")}
                    />
                  </th>
                  <th className="p-2 font-medium">
                    <ColumnMenu
                      label={t("Llegada")}
                      sort={sortOf("start_at")}
                      sortLabels={["Más antiguas primero", "Más recientes primero"]}
                      onSort={sortBy("start_at")}
                      active={!!(arrival.from || arrival.to)}
                      onClear={() => setArrival(NO_BOUNDS)}
                    >
                      <DateBoundsFilter {...arrival} onChange={setArrival} />
                    </ColumnMenu>
                  </th>
                  <th className="p-2 font-medium">
                    <ColumnMenu
                      label={t("Salida")}
                      sort={sortOf("end_at")}
                      sortLabels={["Más antiguas primero", "Más recientes primero"]}
                      onSort={sortBy("end_at")}
                      active={!!(departure.from || departure.to)}
                      onClear={() => setDeparture(NO_BOUNDS)}
                    >
                      <DateBoundsFilter {...departure} onChange={setDeparture} />
                    </ColumnMenu>
                  </th>
                  {multiHotel && (
                    <th className="p-2 font-medium">
                      <ColumnMenu
                        label={t("Hotel")}
                        active={hotels.length > 0}
                        onClear={() => setHotels([])}
                      >
                        <ValuesFilter
                          options={(staffHotels ?? []).map((h) => ({ value: h.id, label: h.name }))}
                          selected={hotels}
                          onChange={(next) => {
                            setHotels(next);
                            // Drop rooms of hotels no longer shown.
                            const keep = new Set(
                              (rooms ?? [])
                                .filter((r) => !next.length || next.includes(r.tenant_id))
                                .map((r) => r.id),
                            );
                            setRoomIds((ids) => ids.filter((id) => keep.has(id)));
                          }}
                        />
                      </ColumnMenu>
                    </th>
                  )}
                  <th className="p-2 font-medium">
                    <ColumnMenu
                      label={t("Habitación")}
                      active={roomIds.length > 0}
                      onClear={() => setRoomIds([])}
                    >
                      <ValuesFilter
                        options={roomOptions}
                        selected={roomIds}
                        onChange={setRoomIds}
                      />
                    </ColumnMenu>
                  </th>
                  <th className="p-2 font-medium">{t("Cliente")}</th>
                  <th className="p-2 font-medium">
                    <ColumnMenu
                      label={t("Origen")}
                      active={origins.length > 0}
                      onClear={() => setOrigins([])}
                    >
                      <ValuesFilter
                        options={[
                          ...Object.entries(ORIGINS).map(([value, o]) => ({
                            value,
                            label: t(o.label),
                          })),
                          { value: NO_ORIGIN, label: "Sin origen" },
                        ]}
                        selected={origins}
                        onChange={setOrigins}
                      />
                    </ColumnMenu>
                  </th>
                  <th className="p-2 font-medium">
                    <ColumnMenu
                      label={t("Estado")}
                      active={statuses.length > 0}
                      onClear={() => setStatuses([])}
                    >
                      <ValuesFilter
                        options={Object.entries(STATUS_LABELS).map(([value, label]) => ({
                          value,
                          label: t(label),
                        }))}
                        selected={statuses}
                        onChange={setStatuses}
                      />
                    </ColumnMenu>
                  </th>
                  <th className="p-2 font-medium">
                    <ColumnMenu
                      label={t("Total")}
                      align="right"
                      sort={sortOf("total")}
                      sortLabels={["De menor a mayor", "De mayor a menor"]}
                      onSort={sortBy("total")}
                    />
                  </th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered?.map((r) => {
                  const s = new Date(r.start_at);
                  const e = new Date(r.end_at);
                  const nights = Math.max(1, Math.round((e.getTime() - s.getTime()) / DAY_MS));
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
                          <div className="font-mono text-xs font-semibold tracking-wide">
                            {r.reference}
                          </div>
                        </td>
                        <td className="p-2 whitespace-nowrap tabular-nums">
                          {s.toLocaleDateString(currentLocale(), DATE_FMT)}
                        </td>
                        <td className="p-2 whitespace-nowrap tabular-nums">
                          <div>{e.toLocaleDateString(currentLocale(), DATE_FMT)}</div>
                          <div className="text-xs text-muted-foreground">
                            {nights} {nights === 1 ? "noche" : "noches"}
                          </div>
                        </td>
                        {multiHotel && <td className="p-2">{hotelName.get(r.tenant_id) ?? "—"}</td>}
                        <td className="p-2">{r.rooms?.name}</td>
                        <td className="p-2">
                          <div>{r.customers?.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.customers?.phone ?? ""}
                          </div>
                        </td>
                        <td className="p-2">
                          {(() => {
                            const role = (r as { created_by_role?: string | null }).created_by_role;
                            // Channel bookings show the channel (Booking.com, a tour operator…).
                            const channel = (r as { channels?: { name: string } | null }).channels;
                            const info =
                              (role === "ota" || role === "tour_operator") && channel
                                ? {
                                    label: channel.name,
                                    cls: "bg-gold/15 text-gold border-gold/40",
                                  }
                                : role
                                  ? ORIGINS[role]
                                  : null;
                            return info ? (
                              <Badge variant="outline" className={info.cls}>
                                {t(info.label)}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            );
                          })()}
                        </td>
                        <td className="p-2">
                          <Badge variant="outline" className={STATUS_COLORS[r.status]}>
                            {t(STATUS_LABELS[r.status])}
                          </Badge>
                          {(r.status === "cancelled" || r.status === "rejected") &&
                            (r.cancellation_category || r.cancellation_reason) && (
                              <div className="mt-1 max-w-[220px] space-y-0.5 text-xs text-muted-foreground">
                                <div className="font-medium">
                                  {isCancellationCategory(r.cancellation_category)
                                    ? CANCELLATION_CATEGORIES[r.cancellation_category]
                                    : r.cancellation_reason}
                                </div>
                                {r.cancellation_note && (
                                  <div className="italic" title={t("Nota interna")}>
                                    {r.cancellation_note}
                                  </div>
                                )}
                              </div>
                            )}
                        </td>
                        <td className="p-2 text-right font-medium tabular-nums">
                          {eur(Number(r.total))}
                          {/* Reservas de web pública: importe realmente cobrado al
                            TPV (depósito, ya con descuentos/promos aplicados). */}
                          {r.created_by_role === "public" && r.deposit_paid && (
                            <div className="text-xs font-normal text-emerald-700 dark:text-emerald-300">
                              {t("Pagado web:")} {eur(Number(r.paid_amount))}
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {canOperate &&
                            r.status !== "cancelled" &&
                            r.status !== "rejected" &&
                            r.status !== "completed" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCancelCategory("");
                                  setCancelNote("");
                                  setCancelTarget(r.id);
                                }}
                                title={t("Cancelar")}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                        </td>
                      </tr>
                      {extraItems?.length || notes?.trim() ? (
                        <tr className="border-b last:border-0 bg-muted/10">
                          <td colSpan={cols} className="px-2 pb-2 pt-0">
                            <ReservationExtrasInfo items={extraItems} notes={notes} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
                {!filtered?.length && (
                  <tr>
                    <td colSpan={cols} className="p-8 text-center text-muted-foreground">
                      {filtering ? t("Ninguna reserva cumple los filtros.") : t("Sin reservas.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {!query && filtered?.length === LIMIT && (
        <p className="text-xs text-muted-foreground">
          {t("Se muestran las")} {LIMIT}{" "}
          {t(
            "primeras según el orden elegido. Usa los filtros de las columnas o el buscador para encontrar otras.",
          )}
        </p>
      )}

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
          if (!o) closeCancel();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Cancelar reserva")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cancel-category">
                {t("Motivo")} <span className="text-destructive">*</span>
              </Label>
              <Select
                value={cancelCategory}
                onValueChange={(v) => setCancelCategory(v as CancellationCategory)}
              >
                <SelectTrigger id="cancel-category">
                  <SelectValue placeholder={t("Elige un motivo")} />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(CANCELLATION_CATEGORIES[c])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cancel-note">{t("Nota interna")}</Label>
              <Textarea
                id="cancel-note"
                rows={3}
                maxLength={2000}
                placeholder={t("Detalles para el equipo (no la ve el huésped)")}
                value={cancelNote}
                onChange={(e) => setCancelNote(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("El motivo alimenta los informes y los modelos de predicción.")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCancel}>
              {t("Volver")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancel}
              disabled={!cancelCategory || cancel.isPending}
            >
              {cancel.isPending ? t("Cancelando…") : t("Confirmar cancelación")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
