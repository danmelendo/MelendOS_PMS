import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { INVOICE_TYPES } from "@domain/invoicing.ts";
import { useGuestInvoices } from "@/lib/invoices";

/** "Mi reserva": links to the stay's invoices, once the hotel has issued them. */
export function GuestInvoices({
  reservationId,
  token,
}: {
  reservationId: string;
  token: string | null;
}) {
  const { data } = useGuestInvoices(reservationId, token);
  const shown = (data ?? []).filter((i) => i.status !== "replaced");
  if (!shown.length) return null;
  return (
    <div className="mt-4 bg-white p-6 shadow-sm ring-1 ring-neutral-100">
      <h3 className="mb-3 flex items-center gap-2 font-semibold text-neutral-700">
        <FileText className="h-5 w-5" /> Facturas
      </h3>
      <ul className="space-y-2">
        {shown.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
            <span>
              {INVOICE_TYPES[i.type]} <span className="font-mono text-xs">{i.number}</span>
              {i.status === "cancelled" && <span className="ml-1 text-neutral-400">(anulada)</span>}
            </span>
            <Link
              to="/web/invoice/$bookingId/$invoiceId"
              params={{ bookingId: reservationId, invoiceId: i.id }}
              className="font-semibold text-[var(--brand)]"
            >
              Ver y descargar
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
