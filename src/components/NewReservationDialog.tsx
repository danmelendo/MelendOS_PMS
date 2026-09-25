import { useState, useMemo, useEffect, type ReactNode } from "react";
import { format } from "date-fns";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  CHECKIN_HOUR,
  CHECKOUT_HOUR,
  EXTRA_CATEGORIES,
  EXTRA_CATEGORY_LABELS,
  eur,
  useExtras,
  useRooms,
} from "@/lib/data";
import { FEATURE_LABELS } from "@/lib/stays";
import type { AssetFeature } from "@/integrations/pms/types";
import { calculateNightlyPrice, type PriceBreakdown } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BedDouble, CalendarIcon, Gift, Minus, Plus, ShieldAlert, Users, X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStart?: Date;
  defaultRoomId?: string;
  mode?: "standard" | "admin";
  /** When set, the dialog edits this existing reservation instead of creating one. */
  editReservationId?: string;
}

const MAX_NIGHTS = 30;
const DAY_MS = 86_400_000;
// Statuses that keep a room busy for the room picker's availability hint.
const BLOCKING = ["pending", "confirmed", "in_progress", "completed"];

type RoomRow = NonNullable<ReturnType<typeof useRooms>["data"]>[number] & {
  rate_groups?: { name: string } | null;
  features?: string[];
};

// Staff reservation editor. A right-hand drawer (Radix Dialog underneath, so
// focus trap, Escape and aria come for free): the form scrolls on the left and
// a sticky summary on the right previews the selected room and the live price
// breakdown, so staff never lose sight of what they are about to save.
export function NewReservationDialog({
  open,
  onOpenChange,
  defaultStart,
  defaultRoomId,
  mode = "standard",
  editReservationId,
}: Props) {
  const isAdmin = mode === "admin";
  const isEdit = !!editReservationId;
  const qc = useQueryClient();
  const { data: roomsData } = useRooms();
  const rooms = roomsData as RoomRow[] | undefined;
  const { data: extras } = useExtras();

  const [date, setDate] = useState<string>("");
  const [nightsCount, setNightsCount] = useState(1);
  const [cleaningMinutes, setCleaningMinutes] = useState<number>(15);
  const [roomId, setRoomId] = useState<string>("");
  const [people, setPeople] = useState(2);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [extraQty, setExtraQty] = useState<Record<string, number>>({});
  const [extraPrice, setExtraPrice] = useState<Record<string, string>>({});
  const [breakdown, setBreakdown] = useState<PriceBreakdown | null>(null);
  const [overrideTotal, setOverrideTotal] = useState<string>("");
  const [overrideEnd, setOverrideEnd] = useState<string>(""); // datetime-local for admin
  const [loadedCustomerId, setLoadedCustomerId] = useState<string | null>(null); // edit mode
  const [loadedManualOverride, setLoadedManualOverride] = useState(false); // edit mode

  // The override controls (manual total / end time) are available to admins and,
  // crucially, when editing a reservation that was already saved as a manual
  // override — even from the standard reservations/calendar dialogs (mode !==
  // "admin"). Without this, editing such a reservation would silently drop the
  // manual price back to the auto-calculated one.
  const canOverride = isAdmin || loadedManualOverride;

  useEffect(() => {
    if (!open) return;
    if (editReservationId) return; // edit mode populates from the existing reservation
    setDate(format(defaultStart ?? new Date(), "yyyy-MM-dd"));
    setNightsCount(1);
    setCleaningMinutes(15);
    setRoomId(defaultRoomId ?? "");
    setPeople(2);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setNotes("");
    setExtraQty({});
    setExtraPrice({});
    setBreakdown(null);
    setOverrideTotal("");
    setOverrideEnd("");
    setLoadedCustomerId(null);
    setLoadedManualOverride(false);
  }, [open, defaultStart, defaultRoomId, editReservationId]);

  // Edit mode: load the existing reservation + its extras and prefill the form.
  useEffect(() => {
    if (!open || !editReservationId) return;
    let cancel = false;
    (async () => {
      const { data: r, error } = await supabase
        .from("reservations")
        .select(
          "*, customers(name,phone,email), reservation_extras(extra_id,qty,unit_price,is_gift)",
        )
        .eq("id", editReservationId)
        .single();
      if (error || !r || cancel) return;
      const s = new Date(r.start_at);
      const e = new Date(r.end_at);
      setDate(format(s, "yyyy-MM-dd"));
      setNightsCount(Math.max(1, Math.round((e.getTime() - s.getTime()) / DAY_MS)));
      setCleaningMinutes(Math.max(15, r.cleaning_minutes ?? 15));
      setRoomId(r.room_id);
      setPeople(r.people ?? 2);
      setLoadedCustomerId(r.customer_id ?? null);
      const cust = Array.isArray(r.customers) ? r.customers[0] : r.customers;
      setCustomerName(cust?.name ?? "");
      setCustomerPhone(cust?.phone ?? "");
      setCustomerEmail(cust?.email ?? "");
      setNotes(r.internal_notes ?? "");
      const qty: Record<string, number> = {};
      const price: Record<string, string> = {};
      for (const row of (r.reservation_extras ?? []) as {
        extra_id: string;
        qty: number;
        unit_price: number;
        is_gift: boolean;
      }[]) {
        if (row.is_gift) continue; // gifts are re-applied automatically by pricing
        qty[row.extra_id] = row.qty;
        price[row.extra_id] = Number(row.unit_price).toFixed(2).replace(".", ",");
      }
      setExtraQty(qty);
      setExtraPrice(price);
      // Re-seed the admin price override so editing preserves the manual total
      // instead of silently reverting to the auto-calculated price.
      setLoadedManualOverride(!!r.manual_override);
      if (r.manual_override) {
        setOverrideTotal(Number(r.total).toFixed(2).replace(".", ","));
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open, editReservationId]);

  const startAt = useMemo(
    () => (date ? new Date(`${date}T${String(CHECKIN_HOUR).padStart(2, "0")}:00:00`) : null),
    [date],
  );

  const endAt = useMemo(() => {
    if (!startAt) return null;
    const e = new Date(startAt);
    e.setDate(e.getDate() + Math.max(1, nightsCount));
    e.setHours(CHECKOUT_HOUR, 0, 0, 0);
    return e;
  }, [startAt, nightsCount]);

  const room = useMemo(() => rooms?.find((r) => r.id === roomId), [rooms, roomId]);
  const rateGroupId = room?.rate_group_id ?? null;
  const maxPeople = Math.max(1, room?.capacity ?? 4);

  useEffect(() => {
    if (people > maxPeople) setPeople(maxPeople);
  }, [people, maxPeople]);

  // Nightly base price per rate group, for the room picker.
  const { data: nightlyRates } = useQuery({
    queryKey: ["rate_nightly"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("rate_nightly").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Rooms already taken for the chosen dates (hint only; the backend trigger is
  // the real guard against overlaps).
  const { data: busyRoomIds } = useQuery({
    queryKey: ["reservations", "busy", startAt?.toISOString(), endAt?.toISOString()],
    enabled: open && !!startAt && !!endAt,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id, room_id")
        .lt("start_at", endAt!.toISOString())
        .gt("end_at", startAt!.toISOString())
        .in("status", BLOCKING as never);
      if (error) throw error;
      return new Set((data ?? []).filter((r) => r.id !== editReservationId).map((r) => r.room_id));
    },
  });

  const roomsByBuilding = useMemo(() => {
    const groups = new Map<string, RoomRow[]>();
    for (const r of rooms ?? []) {
      if (!r.active && r.id !== roomId) continue;
      const list = groups.get(r.building) ?? [];
      list.push(r);
      groups.set(r.building, list);
    }
    return [...groups.entries()];
  }, [rooms, roomId]);

  const selectedExtras = useMemo(() => {
    if (!extras) return [];
    return Object.entries(extraQty)
      .filter(([, q]) => q > 0)
      .map(([id, q]) => {
        const ex = extras.find((e) => e.id === id)!;
        const base = Number(ex.price);
        const manualRaw = ex.category === "services" ? (extraPrice[id] ?? "") : "";
        const manual = Number.parseFloat(manualRaw.replace(",", "."));
        const unitPrice = ex.category === "services" && Number.isFinite(manual) ? manual : base;
        return { extraId: id, qty: q, price: unitPrice, name: ex.name };
      });
  }, [extras, extraPrice, extraQty]);

  // recompute price
  useEffect(() => {
    if (!rateGroupId || !startAt || !endAt) {
      setBreakdown(null);
      return;
    }
    let cancel = false;
    calculateNightlyPrice({
      rateGroupId,
      checkIn: startAt,
      checkOut: endAt,
      extras: selectedExtras,
    })
      .then((b) => {
        if (!cancel) setBreakdown(b);
      })
      .catch((e: unknown) => {
        if (cancel) return;
        setBreakdown(null);
        toast.error(e instanceof Error ? e.message : "Error calculando precio");
      });
    return () => {
      cancel = true;
    };
  }, [rateGroupId, startAt, endAt, selectedExtras]);

  const create = useMutation({
    mutationFn: async () => {
      if (!startAt || !endAt || !roomId) throw new Error("Datos incompletos");
      if (!isAdmin && !rateGroupId) throw new Error("Datos incompletos");
      if (!isAdmin && !breakdown) throw new Error("Datos incompletos");
      if (!isAdmin && (breakdown?.base ?? 0) <= 0)
        throw new Error("Tarifa por noche no configurada");

      // Customer. El nombre pertenece a ESTA reserva (identificada por su id), no
      // a un cliente compartido: puede haber muchos "Carlos".
      // En edición, si la ficha de cliente la usan OTRAS reservas, creamos una
      // ficha nueva para esta reserva (así no les cambiamos el nombre a las demás);
      // si es exclusiva de esta reserva, la actualizamos en sitio.
      let customerId: string | null = isEdit ? loadedCustomerId : null;
      if (isEdit && loadedCustomerId) {
        const { count: usedByOthers } = await supabase
          .from("reservations")
          .select("id", { count: "exact", head: true })
          .eq("customer_id", loadedCustomerId)
          .neq("id", editReservationId!);
        if ((usedByOthers ?? 0) > 0) {
          const { data: c, error } = await supabase
            .from("customers")
            .insert({
              name: customerName || null,
              phone: customerPhone || null,
              email: customerEmail || null,
            })
            .select("id")
            .single();
          if (error) throw error;
          customerId = c.id;
        } else {
          await supabase
            .from("customers")
            .update({
              name: customerName || null,
              phone: customerPhone || null,
              email: customerEmail || null,
            })
            .eq("id", loadedCustomerId);
        }
      } else if (customerPhone || customerName || customerEmail) {
        if (customerPhone) {
          const { data: existing } = await supabase
            .from("customers")
            .select("id")
            .eq("phone", customerPhone)
            .maybeSingle();
          if (existing) customerId = existing.id;
        }
        if (!customerId && customerEmail) {
          const { data: existing } = await supabase
            .from("customers")
            .select("id")
            .eq("email", customerEmail)
            .maybeSingle();
          if (existing) customerId = existing.id;
        }
        if (!customerId) {
          const { data: c, error } = await supabase
            .from("customers")
            .insert({
              name: customerName || null,
              phone: customerPhone || null,
              email: customerEmail || null,
            })
            .select("id")
            .single();
          if (error) throw error;
          customerId = c.id;
        }
      }

      let finalEnd = endAt;
      if (canOverride && overrideEnd) {
        finalEnd = new Date(overrideEnd);
        if (Number.isNaN(finalEnd.getTime()) || finalEnd <= startAt)
          throw new Error("Hora de salida inválida");
      }

      const overrideNum = Number.parseFloat(overrideTotal.replace(",", "."));
      const useOverride = canOverride && Number.isFinite(overrideNum);
      const finalTotal = useOverride ? overrideNum : (breakdown?.total ?? 0);

      const reservationFields = {
        room_id: roomId,
        customer_id: customerId,
        start_at: startAt.toISOString(),
        end_at: finalEnd.toISOString(),
        people,
        base_price: useOverride ? finalTotal : (breakdown?.base ?? 0),
        dynamic_surcharge: breakdown?.dynamicSurcharge ?? 0,
        dynamic_reason: useOverride ? "Precio manual (admin)" : (breakdown?.dynamicReason ?? null),
        extras_total: breakdown?.extrasTotal ?? 0,
        total: finalTotal,
        internal_notes: notes || null,
        cleaning_minutes: Math.max(15, cleaningMinutes || 15),
      };

      let reservationId: string;
      if (isEdit && editReservationId) {
        // Update existing reservation (preserve manual_override / created_by_role).
        const { error: upErr } = await supabase
          .from("reservations")
          .update(reservationFields)
          .eq("id", editReservationId);
        if (upErr) throw upErr;
        reservationId = editReservationId;
        // Replace the extras with the current selection.
        await supabase.from("reservation_extras").delete().eq("reservation_id", reservationId);
      } else {
        const { data: reservation, error } = await supabase
          .from("reservations")
          .insert({
            ...reservationFields,
            manual_override: isAdmin,
            created_by_role: isAdmin ? "admin" : "reception",
          })
          .select("id")
          .single();
        if (error) throw error;
        reservationId = reservation.id;
      }

      // Insert extras
      const rows = selectedExtras.map((e) => ({
        reservation_id: reservationId,
        extra_id: e.extraId,
        qty: e.qty,
        unit_price: e.price,
        is_gift: false,
      }));
      if (breakdown) {
        for (const giftId of breakdown.giftedExtraIds) {
          if (!rows.some((r) => r.extra_id === giftId)) {
            rows.push({
              reservation_id: reservationId,
              extra_id: giftId,
              qty: 1,
              unit_price: 0,
              is_gift: true,
            });
          }
        }
      }
      if (rows.length > 0) {
        const { error: e2 } = await supabase.from("reservation_extras").insert(rows);
        if (e2) throw e2;
      }

      return reservationId;
    },
    onSuccess: () => {
      toast.success(isEdit ? "Reserva actualizada" : "Reserva creada");
      qc.invalidateQueries({ queryKey: ["reservations"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Total shown to the user: the manual override (if a valid number is set)
  // takes precedence over the auto-calculated breakdown total.
  const displayTotal = useMemo(() => {
    const overrideNum = Number.parseFloat(overrideTotal.replace(",", "."));
    if (canOverride && Number.isFinite(overrideNum)) return overrideNum;
    return breakdown?.total ?? null;
  }, [canOverride, overrideTotal, breakdown]);
  const isManualTotal = canOverride && displayTotal !== (breakdown?.total ?? null);

  const incExtra = (id: string, delta: number) => {
    setExtraQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + delta) }));
  };

  const giftedExtras =
    extras?.filter((e) => breakdown?.giftedExtraIds.includes(e.id) && !extraQty[e.id]) ?? [];
  const nightsLabel = `${nightsCount} ${nightsCount === 1 ? "noche" : "noches"}`;
  const fmtDay = (d: Date) =>
    d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
  const selectedDate = date ? new Date(`${date}T00:00:00`) : undefined;
  const canSave = !!roomId && !!startAt && !create.isPending;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="drawer-overlay fixed inset-0 z-50 bg-primary/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="drawer-panel fixed inset-y-0 right-0 z-50 flex w-full max-w-[1120px] flex-col bg-background shadow-2xl outline-none sm:border-l"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-4 border-b bg-card px-6 py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-foreground">
                {isEdit ? "Editar reserva" : isAdmin ? "Reserva manual" : "Nueva reserva"}
              </p>
              <DialogPrimitive.Title className="truncate text-lg font-semibold tracking-tight">
                {room ? `${room.name} · ${room.building}` : "Selecciona fechas y habitación"}
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden">
            {/* ── Form ─────────────────────────────────────────────── */}
            <div className="space-y-8 px-6 py-6 lg:overflow-y-auto">
              {canOverride && (
                <div className="space-y-3 rounded-lg border border-gold/50 bg-gold/10 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gold-foreground">
                    <ShieldAlert className="h-4 w-4" /> Override de administración
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Salida (opcional)">
                      <Input
                        type="datetime-local"
                        value={overrideEnd}
                        onChange={(e) => setOverrideEnd(e.target.value)}
                      />
                    </Field>
                    <Field label="Total final € (opcional)">
                      <Input
                        inputMode="decimal"
                        placeholder="Calculado automáticamente"
                        value={overrideTotal}
                        onChange={(e) => setOverrideTotal(e.target.value)}
                      />
                    </Field>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    La reserva se marca como manual y se salta la separación de limpieza.
                  </p>
                </div>
              )}

              <Section
                title="Estancia"
                hint={`Check-in ${CHECKIN_HOUR}:00 · check-out ${CHECKOUT_HOUR}:00`}
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Entrada">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 opacity-70" />
                          {selectedDate ? (
                            fmtDay(selectedDate)
                          ) : (
                            <span className="text-muted-foreground">Selecciona fecha</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={(d) => setDate(d ? format(d, "yyyy-MM-dd") : "")}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </Field>
                  <Field label="Noches">
                    <Select
                      value={String(nightsCount)}
                      onValueChange={(v) => setNightsCount(Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-[40vh]">
                        {Array.from({ length: MAX_NIGHTS }, (_, i) => i + 1).map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n} {n === 1 ? "noche" : "noches"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Huéspedes">
                    <Stepper
                      value={people}
                      min={1}
                      max={maxPeople}
                      onChange={setPeople}
                      label="huéspedes"
                    />
                  </Field>
                </div>
              </Section>

              <Section
                title="Habitación"
                hint={startAt ? "Disponibilidad para las fechas elegidas" : undefined}
              >
                <div className="space-y-4">
                  {roomsByBuilding.map(([building, list]) => (
                    <div key={building}>
                      <div className="mb-2 text-xs font-medium text-muted-foreground">
                        {building}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {list.map((r) => {
                          const busy = busyRoomIds?.has(r.id) ?? false;
                          const selected = r.id === roomId;
                          const rate = nightlyRates?.find(
                            (x) => x.rate_group_id === r.rate_group_id,
                          );
                          return (
                            <button
                              key={r.id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => setRoomId(r.id)}
                              className={cn(
                                "rounded-lg border bg-card px-3 py-2.5 text-left transition-[border-color,box-shadow,background-color] duration-150 hover:border-primary/40",
                                selected && "border-primary ring-2 ring-primary/15",
                                busy && !selected && "opacity-60",
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-medium">{r.name}</span>
                                <span
                                  className={cn(
                                    "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                    busy
                                      ? "bg-destructive/10 text-destructive"
                                      : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                                  )}
                                >
                                  {busy ? "Ocupada" : "Libre"}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                <span className="truncate">
                                  {r.rate_groups?.name ?? "Sin tarifa"} · {r.capacity} pax
                                </span>
                                {rate && (
                                  <span className="shrink-0 tabular-nums text-foreground">
                                    {eur(Number(rate.price))}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Huésped">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Nombre">
                    <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                  </Field>
                  <Field label="Teléfono">
                    <Input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                    />
                  </Field>
                  <Field label="Email (opcional)">
                    <Input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Extras">
                <div className="grid gap-4 sm:grid-cols-2">
                  {EXTRA_CATEGORIES.map((cat) => {
                    const items = extras?.filter((e) => e.category === cat && e.active) ?? [];
                    if (!items.length) return null;
                    return (
                      <div key={cat} className="space-y-1.5">
                        <div className="text-xs font-medium text-muted-foreground">
                          {EXTRA_CATEGORY_LABELS[cat]}
                        </div>
                        {items.map((ex) => {
                          const q = extraQty[ex.id] ?? 0;
                          return (
                            <div
                              key={ex.id}
                              className={cn(
                                "flex items-center gap-2 rounded-md border bg-card px-2.5 py-2 transition-colors",
                                q > 0 && "border-primary/40 bg-accent/40",
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm">{ex.name}</div>
                                {cat === "services" ? (
                                  <div className="mt-1 flex items-center gap-1.5">
                                    <Input
                                      inputMode="decimal"
                                      placeholder="0,00"
                                      aria-label={`Precio de ${ex.name}`}
                                      className="h-7 w-24 tabular-nums"
                                      value={
                                        extraPrice[ex.id] ??
                                        Number(ex.price).toFixed(2).replace(".", ",")
                                      }
                                      onChange={(e) =>
                                        setExtraPrice((p) => ({ ...p, [ex.id]: e.target.value }))
                                      }
                                    />
                                    <span className="text-xs text-muted-foreground">€</span>
                                  </div>
                                ) : (
                                  <div className="truncate text-xs text-muted-foreground">
                                    {eur(Number(ex.price))}
                                    {ex.description ? ` · ${ex.description}` : ""}
                                  </div>
                                )}
                              </div>
                              <Stepper
                                value={q}
                                min={0}
                                max={99}
                                onChange={(v) => incExtra(ex.id, v - q)}
                                label={ex.name}
                                compact
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </Section>

              <Section title="Operativa">
                <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
                  <Field label="Limpieza tras la salida (min)">
                    <Input
                      type="number"
                      min={15}
                      step={5}
                      value={cleaningMinutes}
                      onChange={(e) =>
                        setCleaningMinutes(Math.max(15, Number(e.target.value) || 15))
                      }
                    />
                  </Field>
                  <Field label="Notas internas">
                    <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </Field>
                </div>
              </Section>
            </div>

            {/* ── Summary ──────────────────────────────────────────── */}
            <aside className="border-t bg-muted/40 lg:flex lg:min-h-0 lg:flex-col lg:border-l lg:border-t-0">
              <div className="space-y-5 p-6 lg:flex-1 lg:overflow-y-auto">
                <RoomPreview room={room} />

                <div className="space-y-2 rounded-lg border bg-card p-4 text-sm">
                  <SummaryRow
                    label="Entrada"
                    value={startAt ? `${fmtDay(startAt)} · ${CHECKIN_HOUR}:00` : "—"}
                  />
                  <SummaryRow
                    label="Salida"
                    value={endAt ? `${fmtDay(endAt)} · ${CHECKOUT_HOUR}:00` : "—"}
                  />
                  <SummaryRow label="Huéspedes" value={String(people)} />
                </div>

                <div className="space-y-2 rounded-lg border bg-card p-4 text-sm">
                  <SummaryRow
                    label={`Alojamiento · ${nightsLabel}`}
                    value={eur(breakdown?.base)}
                    hint={
                      breakdown && nightsCount > 0
                        ? `${eur(breakdown.base / nightsCount)} / noche de media`
                        : undefined
                    }
                  />
                  {(breakdown?.dynamicSurcharge ?? 0) > 0 && (
                    <SummaryRow
                      label="Recargo dinámico"
                      value={eur(breakdown?.dynamicSurcharge)}
                      hint={breakdown?.dynamicReason ?? undefined}
                      tone="gold"
                    />
                  )}
                  {selectedExtras.map((e) => (
                    <SummaryRow
                      key={e.extraId}
                      label={`${e.name}${e.qty > 1 ? ` × ${e.qty}` : ""}`}
                      value={eur(e.qty * e.price)}
                    />
                  ))}
                  {giftedExtras.map((e) => (
                    <SummaryRow
                      key={e.id}
                      label={
                        <span className="inline-flex items-center gap-1.5">
                          <Gift className="h-3.5 w-3.5 text-gold-foreground" /> {e.name}
                        </span>
                      }
                      value="Regalo"
                      tone="gold"
                    />
                  ))}
                  <div className="border-t pt-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">Total{isManualTotal ? " (manual)" : ""}</span>
                      <span className="text-2xl font-semibold tabular-nums tracking-tight">
                        {displayTotal !== null ? eur(displayTotal) : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 border-t bg-card p-4">
                <DialogPrimitive.Close asChild>
                  <Button variant="outline" className="flex-1">
                    Cancelar
                  </Button>
                </DialogPrimitive.Close>
                <Button className="flex-1" onClick={() => create.mutate()} disabled={!canSave}>
                  {create.isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear reserva"}
                </Button>
              </div>
            </aside>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2 border-b pb-2">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  compact,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center rounded-md border bg-background",
        compact ? "h-8" : "h-9 justify-between",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={compact ? "h-8 w-8" : "h-9 w-9"}
        disabled={value <= min}
        aria-label={`Quitar ${label}`}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <span className="w-7 text-center text-sm tabular-nums">{value}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={compact ? "h-8 w-8" : "h-9 w-9"}
        disabled={value >= max}
        aria-label={`Añadir ${label}`}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  hint,
  tone,
}: {
  label: ReactNode;
  value: string;
  hint?: string;
  tone?: "gold";
}) {
  return (
    <div className={cn("flex justify-between gap-3", tone === "gold" && "text-gold-foreground")}>
      <div className="min-w-0">
        <div className={cn(tone !== "gold" && "text-muted-foreground")}>{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

// Selected room card. Keyed by room id so it cross-fades on change.
function RoomPreview({ room }: { room: RoomRow | undefined }) {
  if (!room) {
    return (
      <div className="flex aspect-[16/10] flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card text-sm text-muted-foreground">
        <BedDouble className="h-6 w-6" />
        Elige una habitación
      </div>
    );
  }
  const features = (room.features ?? []).filter((f): f is AssetFeature => f in FEATURE_LABELS);
  return (
    <div key={room.id} className="preview-swap overflow-hidden rounded-lg border bg-card">
      <div className="relative aspect-[16/10] bg-muted">
        {room.image_url && (
          <img src={room.image_url} alt="" className="h-full w-full object-cover" />
        )}
        {room.rate_groups?.name && (
          <span className="absolute left-3 top-3 rounded-full bg-primary/90 px-2.5 py-1 text-[11px] font-medium text-primary-foreground">
            {room.rate_groups.name}
          </span>
        )}
      </div>
      <div className="space-y-2 p-4">
        <div>
          <div className="font-semibold">{room.name}</div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {room.building} · <Users className="h-3 w-3" /> hasta {room.capacity}
          </div>
        </div>
        {features.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {features.map((f) => (
              <span
                key={f}
                className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground"
              >
                {FEATURE_LABELS[f]}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
