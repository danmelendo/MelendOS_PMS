import { useState } from "react";
import { ExternalLink, FileText, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { INVOICE_TYPES, simplifiedAllowed } from "@domain/invoicing.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RecipientForm } from "@/components/RecipientForm";
import { eur } from "@/lib/data";
import {
  INVOICE_STATUS,
  openInvoice,
  RECORD_STATUS,
  TONE,
  useFiscalSettings,
  useInvoiceActions,
  useInvoicePreview,
  useStayInvoices,
  type InvoiceWithRecord,
} from "@/lib/invoices";
import { t } from "@/lib/i18n";

export function RecordBadge({ inv }: { inv: InvoiceWithRecord }) {
  if (!inv.record) return null;
  const s = RECORD_STATUS[inv.record.status];
  return (
    <Badge className={`${TONE[s.tone]} border-0`} title={inv.record.error ?? undefined}>
      {inv.record.kind === "anulacion" && inv.record.status === "accepted"
        ? t("Anulación registrada")
        : s.label}
    </Badge>
  );
}

/** The invoice of a stay, in its bill: issue it, see it, replace a simplified one. */
export function StayInvoices({
  reservationId,
  tenantId,
  canOperate,
}: {
  reservationId: string;
  tenantId: string;
  canOperate: boolean;
}) {
  const { data: settings } = useFiscalSettings(tenantId);
  const { data: invoices } = useStayInvoices(reservationId);
  const live = invoices?.find((i) => i.status === "issued" && ["F1", "F2", "F3"].includes(i.type));
  const { data: preview } = useInvoicePreview(reservationId, !!settings?.enabled && !live);
  const actions = useInvoiceActions(tenantId);
  const [mode, setMode] = useState<"full" | "exchange" | null>(null);

  if (!settings?.enabled) return null;
  const total = preview?.totals.total ?? 0;
  const simplifiedOk = simplifiedAllowed(total, Number(settings.simplified_limit));
  const done = (id: string) => {
    toast.success(t("Factura emitida y enviada a la AEAT"));
    setMode(null);
    openInvoice(id);
  };

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <FileText className="h-4 w-4" /> {t("Factura")}
      </h3>

      {invoices?.map((i) => (
        <div
          key={i.id}
          className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {t(INVOICE_TYPES[i.type])} <span className="font-mono text-xs">{i.number}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {eur(Number(i.total))} · {t(INVOICE_STATUS[i.status])}
              {i.recipient ? ` · ${i.recipient.name}` : ""}
            </p>
            {i.record?.error && i.record.status !== "accepted" && (
              <p className="text-xs text-destructive">
                {i.record.error_code ? `${i.record.error_code} · ` : ""}
                {i.record.error}
              </p>
            )}
          </div>
          <RecordBadge inv={i} />
          <Button size="sm" variant="outline" onClick={() => openInvoice(i.id)}>
            <ExternalLink className="h-4 w-4" /> {t("Ver")}
          </Button>
          {canOperate && i.status === "issued" && i.type === "F2" && (
            <Button size="sm" variant="ghost" onClick={() => setMode("exchange")}>
              {t("Pasar a completa")}
            </Button>
          )}
          {canOperate &&
            i.status === "issued" &&
            i.record?.kind === "alta" &&
            (i.record.status === "rejected" || i.record.status === "accepted_with_errors") && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  actions.resubmit.mutate(
                    { invoiceId: i.id },
                    {
                      onSuccess: () => toast.success(t("Reenviada a la AEAT")),
                      onError: (e) => toast.error(t(e.message)),
                    },
                  )
                }
              >
                <RotateCcw className="h-4 w-4" /> {t("Reenviar")}
              </Button>
            )}
        </div>
      ))}

      {mode === "exchange" && live && (
        <RecipientForm
          submitLabel="Emitir factura completa"
          busy={actions.exchange.isPending}
          onCancel={() => setMode(null)}
          onSubmit={(recipient) =>
            actions.exchange.mutate(
              { invoiceId: live.id, recipient },
              { onSuccess: done, onError: (e) => toast.error(t(e.message)) },
            )
          }
        />
      )}

      {!live && canOperate && preview && (
        <div className="space-y-3 rounded-md border p-3 text-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">{t("A facturar (IVA incluido)")}</span>
            <span className="text-lg font-semibold tabular-nums">{eur(total)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {preview.totals.rows
              .map((r) => `Base ${Number(r.rate)} %: ${eur(Number(r.base))}`)
              .join(" · ")}
          </p>
          {preview.pending_charges > 0 && (
            <p className="text-xs text-destructive">
              {t("Hay")} {preview.pending_charges}{" "}
              {t("cargo(s) pedidos por el huésped sin confirmar.")}
            </p>
          )}
          {mode === "full" ? (
            <RecipientForm
              submitLabel="Emitir factura"
              busy={actions.issue.isPending}
              onCancel={() => setMode(null)}
              onSubmit={(recipient) =>
                actions.issue.mutate(
                  { reservationId, recipient },
                  { onSuccess: done, onError: (e) => toast.error(t(e.message)) },
                )
              }
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={
                  !simplifiedOk ||
                  total <= 0 ||
                  preview.pending_charges > 0 ||
                  actions.issue.isPending
                }
                title={
                  simplifiedOk
                    ? undefined
                    : t("La simplificada llega hasta {0}", {
                        0: eur(Number(settings.simplified_limit)),
                      })
                }
                onClick={() =>
                  actions.issue.mutate(
                    { reservationId, recipient: null },
                    { onSuccess: done, onError: (e) => toast.error(t(e.message)) },
                  )
                }
              >
                {t("Factura simplificada")}
              </Button>
              <Button
                disabled={total <= 0 || preview.pending_charges > 0}
                onClick={() => setMode("full")}
              >
                {t("Factura con datos del cliente")}
              </Button>
            </div>
          )}
          {!simplifiedOk && (
            <p className="text-xs text-muted-foreground">
              {t("Por encima de")} {eur(Number(settings.simplified_limit))}{" "}
              {t("hace falta factura completa.")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
