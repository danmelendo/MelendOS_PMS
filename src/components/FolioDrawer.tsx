import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { Check, CreditCard, Plus, Receipt, X } from "lucide-react";
import { toast } from "sonner";
import { bookingReference } from "@domain/reference.ts";
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
import { eur } from "@/lib/data";
import { SERVICE_CATEGORIES, useFolioActions, useStaffFolio, type StayService } from "@/lib/folio";
import { useRoles } from "@/lib/roles";
import { StayInvoices } from "@/components/StayInvoices";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

/**
 * Reception's view of a stay's bill: confirm or void what the guest ordered,
 * charge services, approve extensions and take the balance at the desk.
 */
export function FolioDrawer({
  reservationId,
  onOpenChange,
}: {
  reservationId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DialogPrimitive.Root open={!!reservationId} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="drawer-overlay fixed inset-0 z-50 bg-primary/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="drawer-panel fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col bg-background shadow-2xl outline-none sm:border-l"
        >
          {reservationId && <FolioBody reservationId={reservationId} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function FolioBody({ reservationId }: { reservationId: string }) {
  const { data: folio } = useStaffFolio(reservationId);
  const { canOperate } = useRoles();
  const actions = useFolioActions(reservationId, folio?.reservation.tenant_id);
  const { data: services } = useQuery({
    queryKey: ["stay-services", "tenant", folio?.reservation.tenant_id],
    enabled: !!folio,
    queryFn: async () => {
      const { data } = await supabase
        .from("stay_services")
        .select("id, tenant_id, category, name, description, price, unit")
        .eq("tenant_id", folio!.reservation.tenant_id)
        .eq("active", true)
        .order("sort_order");
      return (data ?? []) as StayService[];
    },
  });

  const [serviceId, setServiceId] = useState<string>("custom");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [payAmount, setPayAmount] = useState("");

  const pickService = (id: string) => {
    setServiceId(id);
    const s = services?.find((x) => x.id === id);
    if (s) {
      setDescription(s.name);
      setCategory(s.category);
      setPrice(String(s.price));
    } else {
      setDescription("");
      setCategory("other");
      setPrice("");
    }
  };

  const onError = (e: Error) => toast.error(e.message);
  const r = folio?.reservation;
  const live = folio?.charges.filter((c) => c.status !== "void") ?? [];
  const voided = folio?.charges.filter((c) => c.status === "void") ?? [];

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b bg-card px-6 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-foreground">
            Cuenta de la estancia
          </p>
          <DialogPrimitive.Title className="truncate text-lg font-semibold tracking-tight">
            {r
              ? `${r.customers?.name ?? "Huésped"} · ${r.rooms?.name ?? ""} ${r.rooms?.building ?? ""}`
              : "Cargando…"}
          </DialogPrimitive.Title>
          {r && (
            <p className="text-xs text-muted-foreground">
              {day(r.start_at)} → {day(r.end_at)} · Ref. {bookingReference(r.id)}
            </p>
          )}
        </div>
        <DialogPrimitive.Close asChild>
          <Button variant="ghost" size="icon" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </Button>
        </DialogPrimitive.Close>
      </div>

      {folio && r && (
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Extension requests */}
          {folio.extensions.map((x) => (
            <div key={x.id} className="rounded-md border border-gold/50 bg-gold/5 p-3 text-sm">
              <p className="font-medium">
                Pide ampliar hasta el {day(`${x.new_check_out}T12:00:00Z`)} · {x.nights}{" "}
                {x.nights === 1 ? "noche" : "noches"} · {eur(Number(x.amount))}
              </p>
              <p className="text-xs text-muted-foreground">
                Precio calculado con la tarifa del día; la habitación estaba libre al pedirlo.
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  disabled={actions.decideExtension.isPending}
                  onClick={() =>
                    actions.decideExtension.mutate(
                      { id: x.id, approve: true },
                      { onSuccess: () => toast.success("Estancia ampliada"), onError },
                    )
                  }
                >
                  <Check className="mr-1 h-3.5 w-3.5" /> Aprobar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={actions.decideExtension.isPending}
                  onClick={() =>
                    actions.decideExtension.mutate({ id: x.id, approve: false }, { onError })
                  }
                >
                  Rechazar
                </Button>
              </div>
            </div>
          ))}

          {/* Bill */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Receipt className="h-4 w-4" /> Cuenta
            </h3>
            <div className="divide-y rounded-md border text-sm">
              <div className="flex justify-between gap-3 px-3 py-2">
                <span>Reserva (alojamiento y extras)</span>
                <span className="tabular-nums">{eur(Number(r.total))}</span>
              </div>
              {live.map((c) => (
                <div key={c.id} className="px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate">
                        {Number(c.qty) !== 1 ? `${Number(c.qty)} × ` : ""}
                        {c.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {SERVICE_CATEGORIES[c.category] ?? c.category} · {day(c.created_at)}
                        {c.source === "guest" ? " · pedido por el huésped" : ""}
                        {c.note ? ` · «${c.note}»` : ""}
                      </p>
                    </div>
                    <span
                      className={`tabular-nums ${c.status === "requested" ? "text-muted-foreground" : ""}`}
                    >
                      {eur(Number(c.amount))}
                    </span>
                  </div>
                  {voiding === c.id ? (
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Motivo de la anulación"
                        className="h-8"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!reason.trim() || actions.void.isPending}
                        onClick={() =>
                          actions.void.mutate(
                            { id: c.id, reason: reason.trim() },
                            {
                              onSuccess: () => {
                                setVoiding(null);
                                setReason("");
                              },
                              onError,
                            },
                          )
                        }
                      >
                        Anular
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setVoiding(null)}>
                        Volver
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-1 flex gap-2">
                      {c.status === "requested" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          onClick={() =>
                            actions.post.mutate(c.id, {
                              onSuccess: () => toast.success("Cargo confirmado"),
                              onError,
                            })
                          }
                        >
                          <Check className="mr-1 h-3.5 w-3.5" /> Confirmar pedido
                        </Button>
                      )}
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline"
                        onClick={() => {
                          setVoiding(c.id);
                          setReason(c.status === "requested" ? "No se ha servido" : "");
                        }}
                      >
                        {c.status === "requested" ? "Rechazar" : "Anular"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <div className="flex justify-between gap-3 px-3 py-2 text-muted-foreground">
                <span>Pagado</span>
                <span className="tabular-nums">−{eur(Number(r.paid_amount))}</span>
              </div>
              <div className="flex justify-between gap-3 bg-muted/40 px-3 py-2 font-semibold">
                <span>Pendiente</span>
                <span className="tabular-nums">{eur(Math.max(folio.balance, 0))}</span>
              </div>
            </div>
            {live.some((c) => c.status === "requested") && (
              <p className="mt-1 text-xs text-muted-foreground">
                Los pedidos sin confirmar no suman al pendiente.
              </p>
            )}
            {voided.length > 0 && (
              <details className="mt-2 text-xs text-muted-foreground">
                <summary>Anulados ({voided.length})</summary>
                <ul className="mt-1 space-y-0.5">
                  {voided.map((c) => (
                    <li key={c.id} className="line-through">
                      {c.description} · {eur(Number(c.amount))} — {c.void_reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          {/* Add a charge */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Plus className="h-4 w-4" /> Cargar a la habitación
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Servicio</Label>
                <Select value={serviceId} onValueChange={pickService}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Otro concepto…</SelectItem>
                    {services?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} · {eur(Number(s.price))}/{s.unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {serviceId === "custom" && (
                <>
                  <div className="space-y-1.5">
                    <Label>Concepto</Label>
                    <Input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={200}
                      placeholder="Ej. Botella de vino"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tipo</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SERVICE_CATEGORIES).map(([k, label]) => (
                          <SelectItem key={k} value={k}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div className="space-y-1.5">
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Precio unitario (€)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </div>
            <Button
              disabled={
                actions.add.isPending ||
                !description.trim() ||
                !(Number(qty) > 0) ||
                !(Number(price) >= 0) ||
                price === ""
              }
              onClick={() =>
                actions.add.mutate(
                  {
                    category,
                    description: description.trim(),
                    qty: Number(qty),
                    unit_price: Number(price),
                    service_id: serviceId === "custom" ? null : serviceId,
                  },
                  {
                    onSuccess: () => {
                      toast.success("Cargo añadido");
                      pickService("custom");
                      setQty("1");
                    },
                    onError,
                  },
                )
              }
            >
              Añadir cargo
            </Button>
          </section>

          {/* Desk payment */}
          {folio.balance > 0 && (
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <CreditCard className="h-4 w-4" /> Cobrar en recepción
              </h3>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1.5">
                  <Label>Importe (€)</Label>
                  <Input
                    type="number"
                    min={0.01}
                    step={0.01}
                    max={folio.balance}
                    value={payAmount || String(folio.balance)}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-36"
                  />
                </div>
                {(["card", "cash"] as const).map((method) => (
                  <Button
                    key={method}
                    variant="outline"
                    disabled={actions.deskPayment.isPending}
                    onClick={() =>
                      actions.deskPayment.mutate(
                        { amount: Number(payAmount || folio.balance), method },
                        {
                          onSuccess: () => {
                            toast.success("Cobro registrado");
                            setPayAmount("");
                          },
                          onError,
                        },
                      )
                    }
                  >
                    {method === "card" ? "Tarjeta (TPV)" : "Efectivo"}
                  </Button>
                ))}
              </div>
            </section>
          )}
          {folio.balance <= 0 && (
            <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <Check className="h-4 w-4" /> Cuenta saldada.
            </p>
          )}

          <StayInvoices
            reservationId={reservationId}
            tenantId={folio.reservation.tenant_id}
            canOperate={canOperate}
          />
        </div>
      )}
    </>
  );
}
