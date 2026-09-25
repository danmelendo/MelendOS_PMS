import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Download, MapPin } from "lucide-react";
import { toast } from "sonner";
import { pms } from "@/integrations/pms";
import { useMember } from "@/lib/member-session";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_CLASSES, formatDateShort, eur } from "@/lib/stays";
import type { Invoice } from "@/integrations/pms";

export const Route = createFileRoute("/stays/invoices")({
  component: InvoicesScreen,
});

function InvoicesScreen() {
  const { memberId } = useMember();
  const { data: invoices, isLoading } = useQuery({
    queryKey: ["pms", "invoices", memberId],
    queryFn: () => pms.listInvoices(memberId),
  });

  const list = invoices ?? [];
  const pending = list.filter((i) => i.status !== "paid");
  const pendingTotal = pending.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="px-5 pt-6">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <FileText className="h-6 w-6 text-[var(--brand)]" /> Facturas
      </h1>
      <p className="mb-4 text-sm text-neutral-500">
        Facturas de tus estancias y servicios del hotel.
      </p>

      {pending.length > 0 && (
        <div className="mb-5 flex items-center justify-between rounded-xl bg-[var(--brand)]/10 px-4 py-3">
          <div>
            <p className="text-xs font-medium text-neutral-500">Pendiente de pago</p>
            <p className="text-lg font-semibold text-neutral-900">{eur(pendingTotal)}</p>
          </div>
          <span className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white">
            {pending.length} factura{pending.length > 1 ? "s" : ""}
          </span>
        </div>
      )}

      {isLoading && <p className="py-10 text-center text-sm text-neutral-400">Cargando…</p>}

      <div className="space-y-3">
        {list.map((inv) => (
          <InvoiceCard key={inv.id} invoice={inv} />
        ))}
      </div>

      {!isLoading && list.length === 0 && (
        <div className=" bg-white p-8 text-center shadow-sm ring-1 ring-neutral-100">
          <p className="text-sm text-neutral-500">Aún no tienes facturas.</p>
        </div>
      )}
    </div>
  );
}

function InvoiceCard({ invoice }: { invoice: Invoice }) {
  const download = () =>
    toast.info("Descarga simulada", {
      description: `En producción se generaría el PDF de ${invoice.number}.`,
    });

  return (
    <div className=" bg-white p-4 shadow-sm ring-1 ring-neutral-100">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={` border px-2 py-0.5 text-[11px] font-medium ${INVOICE_STATUS_CLASSES[invoice.status]}`}
            >
              {INVOICE_STATUS_LABELS[invoice.status]}
            </span>
            <span className="text-[11px] text-neutral-400">{invoice.number}</span>
          </div>
          <h3 className="mt-1.5 truncate font-semibold text-neutral-900">{invoice.concept}</h3>
          {invoice.propertyName && (
            <p className="flex items-center gap-1 truncate text-xs text-neutral-500">
              <MapPin className="h-3 w-3" /> {invoice.propertyName}
            </p>
          )}
          <p className="mt-0.5 text-xs text-neutral-400">
            Emitida {formatDateShort(invoice.issuedAt)} · Vence {formatDateShort(invoice.dueAt)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold text-neutral-900">{eur(invoice.amount)}</p>
          <p className="text-[11px] text-neutral-400">IVA {eur(invoice.tax)}</p>
        </div>
      </div>
      <button
        onClick={download}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 py-2 text-sm font-medium text-neutral-600 active:scale-[0.99]"
      >
        <Download className="h-4 w-4" /> Descargar PDF
      </button>
    </div>
  );
}
