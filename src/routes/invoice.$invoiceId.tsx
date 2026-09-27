import { createFileRoute } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { useInvoice } from "@/lib/invoices";

// Printable invoice for the hotel's staff (opens in a new tab from the panel).
export const Route = createFileRoute("/invoice/$invoiceId")({
  component: InvoicePage,
});

function InvoicePage() {
  const { invoiceId } = Route.useParams();
  const { data, isLoading } = useInvoice(invoiceId);
  return (
    <div className="min-h-screen bg-neutral-100 px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end print:hidden">
        <Button onClick={() => window.print()} disabled={!data}>
          <Printer className="h-4 w-4" /> Imprimir o guardar en PDF
        </Button>
      </div>
      {isLoading ? (
        <p className="text-center text-sm text-neutral-500">Cargando…</p>
      ) : data ? (
        <InvoiceDocument invoice={data} related={data.related} />
      ) : (
        <p className="text-center text-sm text-neutral-500">
          Factura no encontrada. Entra en el panel con una cuenta del hotel.
        </p>
      )}
    </div>
  );
}
