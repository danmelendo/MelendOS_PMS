import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, FileText, FlaskConical, RotateCcw, Send } from "lucide-react";
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
  type InvoiceWithRecord,
} from "@/lib/invoices";
import { useRoles } from "@/lib/roles";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/_app/invoices")({
  component: InvoicesPage,
});

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
            <FileText className="h-5 w-5 text-info" /> {t("Facturas")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "Facturación VERI*FACTU: cada factura se registra encadenada y se envía a la Agencia Tributaria al momento. Se emiten desde la cuenta de cada estancia.",
            )}
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
                            t("La AEAT pide esperar entre envíos: se enviará en unos segundos"),
                          )
                        : toast.success(
                            `Enviados ${r.sent} · registrados ${r.accepted}` +
                              (r.withErrors ? ` · ${r.withErrors} con errores` : "") +
                              (r.rejected ? ` · ${r.rejected} rechazados` : ""),
                          ),
                  onError: (e) => toast.error(t(e.message)),
                })
              }
            >
              <Send className="h-4 w-4" />{" "}
              {actions.dispatch.isPending ? t("Enviando…") : t("Enviar ahora")}
            </Button>
          )}
        </div>
      </div>

      {settings?.enabled && settings.environment !== "prod" && (
        <p className="flex items-start gap-2 rounded-md bg-gold/15 px-3 py-2 text-sm text-gold-foreground">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
          {settings.environment === "simulated"
            ? t(
                "Modo simulado: las facturas se numeran en una serie de pruebas («P…», sin validez fiscal) y la AEAT se simula en el servidor. Cambia a producción cuando tengas el certificado.",
              )
            : t("Entorno de pruebas de la AEAT: las facturas no tienen validez fiscal.")}
        </p>
      )}
      {!settingsLoading && !settings?.enabled && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {t("La facturación VERI*FACTU no está activada en este hotel.")}
            {isAdmin ? (
              <>
                {" "}
                <Link to="/settings/invoicing" className="font-medium text-foreground underline">
                  {t("Configurarla")}
                </Link>
              </>
            ) : (
              t(" Pídeselo a dirección.")
            )}
          </CardContent>
        </Card>
      )}

      {settings?.enabled && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label={t("Facturado este mes")}
              value={eur(thisMonth.reduce((s, i) => s + Number(i.total), 0))}
            />
            <Stat label={t("Pendientes de envío")} value={String(pending)} />
            <Stat
              label={t("Rechazadas o con errores")}
              value={String(problems)}
              alert={problems > 0}
            />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">{t("Emitidas")}</CardTitle>
              <Input
                placeholder={t("Buscar número o cliente")}
                className="h-8 max-w-56"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </CardHeader>
            <CardContent className="p-0">
              {!invoices?.length ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  {t("Aún no hay facturas. Se emiten desde «Cuenta» en cada estancia.")}
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
                              onSuccess: () => toast.success(t("Se reenviará a la AEAT")),
                              onError: (e) => toast.error(t(e.message)),
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
                                    onError: (e) => toast.error(t(e.message)),
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
                                    onError: (e) => toast.error(t(e.message)),
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
                                        t("Factura anulada; la anulación se envía a la AEAT"),
                                      );
                                    },
                                    onError: (e) => toast.error(t(e.message)),
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

      {isAdmin && settings?.enabled && (
        <p className="text-sm text-muted-foreground">
          {t("Datos fiscales, entorno y certificado:")}{" "}
          <Link to="/settings/invoicing" className="font-medium text-foreground underline">
            {t("Configuración → Facturación")}
          </Link>
        </p>
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
            {t(INVOICE_TYPES[i.type])} · {date(i.issue_date)}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {i.recipient?.name ?? t("Sin destinatario (simplificada)")} · {i.description}
        </p>
        {i.record?.error && i.record.status !== "accepted" && (
          <p className="mt-1 text-xs text-destructive">
            {i.record.error_code ? `${i.record.error_code} · ` : ""}
            {i.record.error}
          </p>
        )}
        {i.record?.csv && (
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {t("CSV")} {i.record.csv}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-semibold tabular-nums">{eur(Number(i.total))}</span>
        <div className="flex gap-1">
          {i.status !== "issued" && (
            <Badge variant="secondary">{t(INVOICE_STATUS[i.status])}</Badge>
          )}
          <RecordBadge inv={i} />
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1">
        <Button size="sm" variant="outline" onClick={() => openInvoice(i.id)}>
          <ExternalLink className="h-4 w-4" /> {t("Ver")}
        </Button>
        {canOperate && live && i.type === "F2" && (
          <Button size="sm" variant="ghost" onClick={() => onOpen("exchange")}>
            {t("Pasar a completa")}
          </Button>
        )}
        {canOperate && live && ["F1", "F2", "F3"].includes(i.type) && (
          <Button size="sm" variant="ghost" onClick={() => onOpen("rectify")}>
            {t("Rectificar")}
          </Button>
        )}
        {canOperate && refused && (
          <Button size="sm" variant="ghost" onClick={onResubmit}>
            <RotateCcw className="h-4 w-4" /> {t("Reenviar")}
          </Button>
        )}
        {isAdmin && canOperate && live && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => onOpen("cancel")}
          >
            {t("Anular")}
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
        {t(
          "Factura rectificativa por diferencias: el importe (IVA incluido) se suma a la factura original; en negativo, se descuenta (una devolución, un error de precio).",
        )}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-2">
          <Label>{t("Concepto")}</Label>
          <Input
            value={f.description}
            maxLength={200}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>{t("Importe (€)")}</Label>
          <Input
            inputMode="decimal"
            placeholder="-25,00"
            value={f.amount}
            onChange={(e) => setF({ ...f, amount: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>{t("IVA")}</Label>
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
          <Label>{t("Motivo")}</Label>
          <Input
            value={f.reason}
            maxLength={300}
            onChange={(e) => setF({ ...f, reason: e.target.value })}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("Cancelar")}
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
          {busy ? t("Emitiendo…") : t("Emitir rectificativa")}
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
        {t(
          "Anular es para una factura expedida por error, sin venta real. Si hay que corregir un importe, emite una rectificativa. La anulación queda registrada y se envía a la AEAT; no se puede deshacer.",
        )}
      </p>
      <div className="space-y-1">
        <Label>{t("Motivo")}</Label>
        <Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("Volver")}
        </Button>
        <Button
          variant="destructive"
          disabled={busy || !reason.trim()}
          onClick={() => onSubmit(reason.trim())}
        >
          {t("Anular factura")}
        </Button>
      </div>
    </div>
  );
}
