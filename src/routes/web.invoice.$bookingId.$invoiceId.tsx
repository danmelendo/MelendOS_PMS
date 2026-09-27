import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { guestToken } from "@/integrations/pms/demo-stays-connector";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { useGuestInvoices } from "@/lib/invoices";

// The guest's invoice, from "Mi reserva" (booking link token or member account).
export const Route = createFileRoute("/web/invoice/$bookingId/$invoiceId")({
  component: GuestInvoicePage,
});

function GuestInvoicePage() {
  const { bookingId, invoiceId } = Route.useParams();
  const { data, isLoading } = useGuestInvoices(bookingId, guestToken(bookingId));
  const invoice = data?.find((i) => i.id === invoiceId);
  const related = (data ?? []).map((i) => ({
    id: i.id,
    number: i.number,
    issue_date: i.issue_date,
  }));
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          to="/web/booking/$bookingId"
          params={{ bookingId }}
          className="flex items-center gap-1.5 text-sm text-neutral-600"
        >
          <ArrowLeft className="h-4 w-4" /> Mi reserva
        </Link>
        <button
          onClick={() => window.print()}
          disabled={!invoice}
          className="flex items-center gap-2 bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Printer className="h-4 w-4" /> Descargar en PDF
        </button>
      </div>
      {isLoading ? (
        <p className="text-center text-sm text-neutral-500">Cargando…</p>
      ) : invoice ? (
        <InvoiceDocument invoice={invoice} related={related} />
      ) : (
        <p className="text-center text-sm text-neutral-500">Factura no encontrada.</p>
      )}
    </div>
  );
}
