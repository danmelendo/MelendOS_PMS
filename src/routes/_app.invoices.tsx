import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ExternalLink,
  FileText,
  FlaskConical,
  KeyRound,
  Lock,
  RotateCcw,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { INVOICE_TYPES, type LineKind } from "@domain/invoicing.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RecipientForm } from "@/components/RecipientForm";
import { RecordBadge } from "@/components/StayInvoices";
import { eur } from "@/lib/data";
import { useStaffHotelModules } from "@/lib/features";
import {
  INVOICE_STATUS,
  openInvoice,
  useFiscalSettings,
  useInvoiceActions,
  useInvoices,
  type FiscalSettings,
  type InvoiceWithRecord,
} from "@/lib/invoices";
import { useRoles } from "@/lib/roles";

export const Route = createFileRoute("/_app/invoices")({
  component: InvoicesPage,
});

const ENVIRONMENTS: Record<FiscalSettings["environment"], string> = {
  simulated: "Simulado (no sale del PMS)",
  pre: "Pruebas de la AEAT",
  prod: "Producción (AEAT)",
};
const date = (ymd: string) => ymd.split("-").reverse().join("/");

function InvoicesPage() {
  const { isAdmin, canOperate, loading } = useRoles();
  const { data: hotels } = useStaffHotelModules();
  const [hotel, setHotel] = useState<string | null>(null);
  useEffect(() => {
    if (!hotel && hotels?.length) setHotel(hotels[0].id);
  }, [hotel, hotels]);
  const [search, setSearch] = useState("");
  const { data: settings, isLoading: settingsLoading } = useFiscalSettings(hotel);
  const { data: invoices } = useInvoices(hotel, search);
  const actions = useInvoiceActions(hotel);
  const [open, setOpen] = useState<{ id: string; mode: "exchange" | "rectify" | "cancel" } | null>(
    null,
  );

  if (loading) return null;
  const pending = invoices?.filter((i) => i.record?.status === "pending").length ?? 0;
  const problems =
    invoices?.filter(
      (i) => i.record && ["rejected", "accepted_with_errors"].includes(i.record.status),
    ).length ?? 0;
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth =
    invoices?.filter((i) => i.issue_date.startsWith(month) && i.status !== "cancelled") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <FileText className="h-5 w-5 text-info" /> Facturas
          </h1>
          <p className="text-sm text-muted-foreground">
            Facturación VERI*FACTU: cada factura se registra encadenada y se envía a la Agencia
            Tributaria al momento. Se emiten desde la cuenta de cada estancia.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {hotels && hotels.length > 1 && (
            <Select value={hotel ?? undefined} onValueChange={setHotel}>
              <SelectTrigger className="min-w-0 flex-1 sm:w-52 sm:flex-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hotels.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {settings?.enabled && canOperate && (
            <Button
              disabled={actions.dispatch.isPending}
              onClick={() =>
                actions.dispatch.mutate(undefined, {
                  onSuccess: (r) =>
                    r.error
                      ? toast.error(r.error)
                      : r.waiting
                        ? toast.info(
                            "La AEAT pide esperar entre envíos: se enviará en unos segundos",
                          )
                        : toast.success(
                            `Enviados ${r.sent} · registrados ${r.accepted}` +
                              (r.withErrors ? ` · ${r.withErrors} con errores` : "") +
                              (r.rejected ? ` · ${r.rejected} rechazados` : ""),
                          ),
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              <Send className="h-4 w-4" />{" "}
              {actions.dispatch.isPending ? "Enviando…" : "Enviar ahora"}
            </Button>
          )}
        </div>
      </div>

      {settings?.enabled && settings.environment !== "prod" && (
        <p className="flex items-start gap-2 rounded-md bg-gold/15 px-3 py-2 text-sm text-gold-foreground">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
          {settings.environment === "simulated"
            ? "Modo simulado: las facturas se numeran en una serie de pruebas («P…», sin validez fiscal) y la AEAT se simula en el servidor. Cambia a producción cuando tengas el certificado."
            : "Entorno de pruebas de la AEAT: las facturas no tienen validez fiscal."}
        </p>
      )}
      {!settingsLoading && !settings?.enabled && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            La facturación VERI*FACTU no está activada en este hotel.
            {isAdmin ? " Configúrala abajo." : " Pídeselo a dirección."}
          </CardContent>
        </Card>
      )}

      {settings?.enabled && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Facturado este mes"
              value={eur(thisMonth.reduce((s, i) => s + Number(i.total), 0))}
            />
            <Stat label="Pendientes de envío" value={String(pending)} />
            <Stat label="Rechazadas o con errores" value={String(problems)} alert={problems > 0} />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">Emitidas</CardTitle>
              <Input
                placeholder="Buscar número o cliente"
                className="h-8 max-w-56"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </CardHeader>
            <CardContent className="p-0">
              {!invoices?.length ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Aún no hay facturas. Se emiten desde «Cuenta» en cada estancia.
                </p>
              ) : (
                <div className="divide-y">
                  {invoices.map((i) => (
                    <div key={i.id}>
                      <Row
                        i={i}
                        isAdmin={isAdmin}
                        canOperate={canOperate}
                        onOpen={(mode) =>
                          setOpen(
                            open?.id === i.id && open.mode === mode ? null : { id: i.id, mode },
                          )
                        }
                        onResubmit={() =>
                          actions.resubmit.mutate(
                            { invoiceId: i.id },
                            {
                              onSuccess: () => toast.success("Se reenviará a la AEAT"),
                              onError: (e) => toast.error(e.message),
                            },
                          )
                        }
                      />
                      {open?.id === i.id && (
                        <div className="px-6 pb-4">
                          {open.mode === "exchange" && (
                            <RecipientForm
                              submitLabel="Emitir factura completa"
                              busy={actions.exchange.isPending}
                              onCancel={() => setOpen(null)}
                              onSubmit={(recipient) =>
                                actions.exchange.mutate(
                                  { invoiceId: i.id, recipient },
                                  {
                                    onSuccess: (id) => {
                                      setOpen(null);
                                      openInvoice(id);
                                    },
                                    onError: (e) => toast.error(e.message),
                                  },
                                )
                              }
                            />
                          )}
                          {open.mode === "rectify" && (
                            <RectifyForm
                              busy={actions.rectify.isPending}
                              onCancel={() => setOpen(null)}
                              onSubmit={(v) =>
                                actions.rectify.mutate(
                                  { invoiceId: i.id, ...v },
                                  {
                                    onSuccess: (id) => {
                                      setOpen(null);
                                      openInvoice(id);
                                    },
                                    onError: (e) => toast.error(e.message),
                                  },
                                )
                              }
                            />
                          )}
                          {open.mode === "cancel" && (
                            <CancelForm
                              busy={actions.cancel.isPending}
                              onCancel={() => setOpen(null)}
                              onSubmit={(reason) =>
                                actions.cancel.mutate(
                                  { invoiceId: i.id, reason },
                                  {
                                    onSuccess: () => {
                                      setOpen(null);
                                      toast.success(
                                        "Factura anulada; la anulación se envía a la AEAT",
                                      );
                                    },
                                    onError: (e) => toast.error(e.message),
                                  },
                                )
                              }
                            />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {isAdmin && hotel && !settingsLoading && (
        <SettingsCard key={hotel} settings={settings ?? null} actions={actions} />
      )}
    </div>
  );
}

function Stat({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold tabular-nums ${alert ? "text-destructive" : ""}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function Row({
  i,
  isAdmin,
  canOperate,
  onOpen,
  onResubmit,
}: {
  i: InvoiceWithRecord;
  isAdmin: boolean;
  canOperate: boolean;
  onOpen: (mode: "exchange" | "rectify" | "cancel") => void;
  onResubmit: () => void;
}) {
  const live = i.status === "issued";
  const refused =
    live &&
    i.record?.kind === "alta" &&
    ["rejected", "accepted_with_errors"].includes(i.record.status);
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-6 py-3 text-sm">
      <div className="min-w-0 flex-1 basis-64">
        <p className="font-medium">
          <span className="font-mono">{i.number}</span>{" "}
          <span className="text-xs font-normal text-muted-foreground">
            {INVOICE_TYPES[i.type]} · {date(i.issue_date)}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {i.recipient?.name ?? "Sin destinatario (simplificada)"} · {i.description}
        </p>
        {i.record?.error && i.record.status !== "accepted" && (
          <p className="mt-1 text-xs text-destructive">
            {i.record.error_code ? `${i.record.error_code} · ` : ""}
            {i.record.error}
          </p>
        )}
        {i.record?.csv && (
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">CSV {i.record.csv}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-semibold tabular-nums">{eur(Number(i.total))}</span>
        <div className="flex gap-1">
          {i.status !== "issued" && <Badge variant="secondary">{INVOICE_STATUS[i.status]}</Badge>}
          <RecordBadge inv={i} />
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1">
        <Button size="sm" variant="outline" onClick={() => openInvoice(i.id)}>
          <ExternalLink className="h-4 w-4" /> Ver
        </Button>
        {canOperate && live && i.type === "F2" && (
          <Button size="sm" variant="ghost" onClick={() => onOpen("exchange")}>
            Pasar a completa
          </Button>
        )}
        {canOperate && live && ["F1", "F2", "F3"].includes(i.type) && (
          <Button size="sm" variant="ghost" onClick={() => onOpen("rectify")}>
            Rectificar
          </Button>
        )}
        {canOperate && refused && (
          <Button size="sm" variant="ghost" onClick={onResubmit}>
            <RotateCcw className="h-4 w-4" /> Reenviar
          </Button>
        )}
        {isAdmin && canOperate && live && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => onOpen("cancel")}
          >
            Anular
          </Button>
        )}
      </div>
    </div>
  );
}

/** A rectification by differences: what to add or, negative, to give back. */
function RectifyForm({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  onSubmit: (v: {
    lines: {
      kind: LineKind;
      description: string;
      qty: number;
      unit_price: number;
      vat_rate: number;
    }[];
    reason: string;
  }) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState({ description: "", amount: "", rate: "10", reason: "" });
  const amount = Number(f.amount.replace(",", "."));
  return (
    <div className="space-y-3 rounded-md border border-info/40 bg-info/5 p-4 text-sm">
      <p className="text-xs text-muted-foreground">
        Factura rectificativa por diferencias: el importe (IVA incluido) se suma a la factura
        original; en negativo, se descuenta (una devolución, un error de precio).
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-2">
          <Label>Concepto</Label>
          <Input
            value={f.description}
            maxLength={200}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>Importe (€)</Label>
          <Input
            inputMode="decimal"
            placeholder="-25,00"
            value={f.amount}
            onChange={(e) => setF({ ...f, amount: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>IVA</Label>
          <Select value={f.rate} onValueChange={(v) => setF({ ...f, rate: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["10", "21", "4", "0"].map((r) => (
                <SelectItem key={r} value={r}>
                  {r} %
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Motivo</Label>
          <Input
            value={f.reason}
            maxLength={300}
            onChange={(e) => setF({ ...f, reason: e.target.value })}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          disabled={
            busy ||
            !f.description.trim() ||
            !f.reason.trim() ||
            !Number.isFinite(amount) ||
            amount === 0
          }
          onClick={() =>
            onSubmit({
              lines: [
                {
                  kind: "other",
                  description: f.description.trim(),
                  qty: 1,
                  unit_price: amount,
                  vat_rate: Number(f.rate),
                },
              ],
              reason: f.reason.trim(),
            })
          }
        >
          {busy ? "Emitiendo…" : "Emitir rectificativa"}
        </Button>
      </div>
    </div>
  );
}

function CancelForm({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p className="text-xs text-muted-foreground">
        Anular es para una factura expedida por error, sin venta real. Si hay que corregir un
        importe, emite una rectificativa. La anulación queda registrada y se envía a la AEAT; no se
        puede deshacer.
      </p>
      <div className="space-y-1">
        <Label>Motivo</Label>
        <Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Volver
        </Button>
        <Button
          variant="destructive"
          disabled={busy || !reason.trim()}
          onClick={() => onSubmit(reason.trim())}
        >
          Anular factura
        </Button>
      </div>
    </div>
  );
}

function SettingsCard({
  settings,
  actions,
}: {
  settings: FiscalSettings | null;
  actions: ReturnType<typeof useInvoiceActions>;
}) {
  const locked = !!settings?.enabled && settings.environment === "prod";
  const [f, setF] = useState({
    enabled: settings?.enabled ?? false,
    environment: settings?.environment ?? "simulated",
    issuer_nif: settings?.issuer_nif ?? "",
    issuer_name: settings?.issuer_name ?? "",
    issuer_address: settings?.issuer_address ?? "",
    simplified_limit: String(settings?.simplified_limit ?? 400),
  });
  const [cert, setCert] = useState({ cert: "", key: "" });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Configuración fiscal</CardTitle>
        <p className="text-sm text-muted-foreground">
          Datos del emisor de las facturas y certificado electrónico con el que el PMS se identifica
          ante la AEAT.
        </p>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        {locked && (
          <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> VERI*FACTU está en producción: no se
            desactiva ni se cambia de entorno desde el panel (la norma no permite usar el sistema a
            voluntad).
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-3">
            <Switch
              checked={f.enabled}
              disabled={locked}
              onCheckedChange={(v) => setF({ ...f, enabled: v })}
            />
            Facturar con VERI*FACTU
          </label>
          <div className="space-y-1">
            <Label>Entorno</Label>
            <Select
              value={f.environment}
              disabled={locked}
              onValueChange={(v) => setF({ ...f, environment: v as FiscalSettings["environment"] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ENVIRONMENTS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fs-nif">NIF del emisor</Label>
            <Input
              id="fs-nif"
              className="font-mono uppercase"
              maxLength={9}
              value={f.issuer_nif}
              onChange={(e) => setF({ ...f, issuer_nif: e.target.value.trim().toUpperCase() })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fs-name">Razón social</Label>
            <Input
              id="fs-name"
              maxLength={120}
              value={f.issuer_name}
              onChange={(e) => setF({ ...f, issuer_name: e.target.value })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="fs-addr">Domicilio fiscal (sale en la factura)</Label>
            <Input
              id="fs-addr"
              maxLength={200}
              value={f.issuer_address}
              onChange={(e) => setF({ ...f, issuer_address: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fs-limit">Límite de la factura simplificada (€)</Label>
            <Input
              id="fs-limit"
              inputMode="decimal"
              value={f.simplified_limit}
              onChange={(e) => setF({ ...f, simplified_limit: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              400 € con carácter general; hasta 3.000 € según la actividad (consúltalo con tu
              gestoría).
            </p>
          </div>
          {settings?.installation_number && (
            <div className="space-y-1">
              <Label>Número de instalación</Label>
              <p className="font-mono text-xs">{settings.installation_number}</p>
            </div>
          )}
        </div>
        <Button
          disabled={actions.saveSettings.isPending}
          onClick={() =>
            actions.saveSettings.mutate(
              { ...f, simplified_limit: Number(f.simplified_limit.replace(",", ".")) || 400 },
              {
                onSuccess: () => toast.success("Configuración guardada"),
                onError: (e) => toast.error(e.message),
              },
            )
          }
        >
          Guardar configuración
        </Button>

        <div className="space-y-3 border-t pt-4">
          <p className="flex items-center gap-2 font-medium">
            <KeyRound className="h-4 w-4" /> Certificado electrónico
            {settings?.has_certificate && (
              <Badge variant="secondary" className="font-normal">
                Guardado
              </Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Certificado cualificado del hotel (o de su representante) en formato PEM. Si lo tienes
            en .p12/.pfx:{" "}
            <code className="rounded bg-muted px-1">
              openssl pkcs12 -in cert.p12 -clcerts -nokeys
            </code>{" "}
            para el certificado y{" "}
            <code className="rounded bg-muted px-1">
              openssl pkcs12 -in cert.p12 -nocerts -nodes
            </code>{" "}
            para la clave. Se guarda cifrado y solo lo usa el servidor.
          </p>
          <textarea
            className="min-h-20 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
            placeholder="-----BEGIN CERTIFICATE-----"
            value={cert.cert}
            onChange={(e) => setCert({ ...cert, cert: e.target.value })}
          />
          <textarea
            className="min-h-20 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
            placeholder="-----BEGIN PRIVATE KEY-----"
            value={cert.key}
            onChange={(e) => setCert({ ...cert, key: e.target.value })}
          />
          <Button
            variant="outline"
            disabled={!cert.cert.trim() || !cert.key.trim() || actions.saveCertificate.isPending}
            onClick={() =>
              actions.saveCertificate.mutate(cert, {
                onSuccess: () => {
                  toast.success("Certificado guardado");
                  setCert({ cert: "", key: "" });
                },
                onError: (e) => toast.error(e.message),
              })
            }
          >
            Guardar certificado
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
