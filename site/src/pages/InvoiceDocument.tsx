import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Printer, X } from "lucide-react";
import { BRAND } from "../config";
import { INVOICE_STATUSES, day, eur, type Client, type ClientInvoice } from "../lib/clients";
import { BTN_OUTLINE, BTN_PRIMARY } from "./admin-ui";
import {
  VERIFACTU_LEGEND,
  qrUrl,
  type VerifactuEnvironment,
} from "../../supabase/functions/_shared/verifactu/domain.ts";

// A Melend/OS invoice as a document: shown over the panel and printed or
// saved as PDF from the browser (the print styles only print this sheet).
// Issued invoices use the issuer and client details frozen when issued;
// drafts use the current ones and say they are drafts.

export interface Issuer {
  issuer_name: string | null;
  issuer_tax_id: string | null;
  issuer_address: string | null;
  issuer_email: string | null;
  issuer_phone: string | null;
  iban: string | null;
  payment_days: number;
  invoice_note: string | null;
  verifactu_environment?: "off" | VerifactuEnvironment;
  installation_number?: string;
  has_certificate?: boolean;
}

interface Recipient {
  name: string | null;
  trade_name?: string | null;
  tax_id: string | null;
  address: string | null;
  email: string | null;
}

const pending = <span className="text-muted-foreground italic">pendiente</span>;

export function InvoiceDocument({
  invoice,
  client,
  issuer: current,
  onClose,
}: {
  invoice: ClientInvoice & {
    issuer?: Issuer | null;
    recipient?: Recipient | null;
    verifactu_env?: VerifactuEnvironment | null;
  };
  client: Client | undefined;
  issuer: Issuer | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.documentElement.classList.add("printing-invoice");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("printing-invoice");
    };
  }, [onClose]);

  const issuer = invoice.issuer ?? current;
  const to: Recipient = invoice.recipient ?? {
    name: client?.legal_name ?? client?.name ?? null,
    trade_name: client?.name ?? null,
    tax_id: client?.tax_id ?? null,
    address: client?.billing_address ?? null,
    email: client?.billing_email ?? null,
  };
  const vat = Math.round((Number(invoice.total) - Number(invoice.base)) * 100) / 100;
  const draft = invoice.status === "draft";
  // Invoices issued with VERI*FACTU carry the tax QR (Orden HAC/1177/2024).
  const [qr, setQr] = useState<string | null>(null);
  const env = invoice.verifactu_env ?? null;
  const nif = (issuer?.issuer_tax_id ?? "").toUpperCase().replace(/[\s.-]/g, "");
  useEffect(() => {
    if (!env || !invoice.number || !invoice.issued_on || !nif) return setQr(null);
    const url = qrUrl({
      environment: env,
      nif,
      number: invoice.number,
      issueDate: invoice.issued_on,
      total: Number(invoice.total),
    });
    QRCode.toDataURL(url, { margin: 0, width: 240, errorCorrectionLevel: "M" }).then(setQr, () =>
      setQr(null),
    );
  }, [env, nif, invoice.number, invoice.issued_on, invoice.total]);
  const period =
    invoice.period_start && invoice.period_end
      ? `${day(invoice.period_start)} – ${day(invoice.period_end)}`
      : null;

  return (
    <div className="invoice-overlay fixed inset-0 z-50 overflow-y-auto bg-navy/60 p-4 print:static print:bg-transparent print:p-0">
      <div className="mx-auto mb-3 flex max-w-[210mm] justify-end gap-2 print:hidden">
        <button type="button" onClick={() => window.print()} className={BTN_PRIMARY}>
          <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir o guardar PDF
        </button>
        <button type="button" onClick={onClose} className={`${BTN_OUTLINE} bg-card`}>
          <X className="h-4 w-4" aria-hidden="true" /> Cerrar
        </button>
      </div>

      <article className="invoice-sheet relative mx-auto flex min-h-[297mm] max-w-[210mm] flex-col bg-white p-[18mm] text-[13px] leading-relaxed text-[#0f1b33] shadow-xl print:min-h-0 print:shadow-none">
        {(draft || invoice.status === "cancelled") && (
          <p
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-[64px] font-bold tracking-widest text-[#0f1b33]/[0.06] uppercase"
            style={{ transform: "rotate(-24deg)" }}
          >
            {draft ? "Borrador" : "Anulada"}
          </p>
        )}

        <header className="flex items-start justify-between gap-6 border-b-2 border-[#0f1b33] pb-5">
          <img src="/logo.webp" alt={BRAND} width={583} height={96} className="h-9 w-auto" />
          <div className="text-right">
            <p className="text-2xl font-bold tracking-tight">Factura</p>
            <p className="font-mono text-sm">{invoice.number ?? "Sin número (borrador)"}</p>
          </div>
        </header>

        {qr && (
          <div className="mt-4 flex items-center gap-4">
            <img src={qr} alt="QR tributario" className="h-[30mm] w-[30mm]" />
            <div className="text-[12px]">
              <p className="font-bold tracking-wide">VERI*FACTU</p>
              <p>{VERIFACTU_LEGEND}</p>
              {env !== "prod" && (
                <p className="text-[#5b6477]">
                  {env === "simulated"
                    ? "Entorno simulado: sin valor fiscal"
                    : "Entorno de pruebas de la AEAT"}
                </p>
              )}
            </div>
          </div>
        )}

        <section className="mt-6 grid grid-cols-2 gap-8">
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-[#5b6477] uppercase">
              Emisor
            </p>
            <p className="mt-1 font-semibold">{issuer?.issuer_name || pending}</p>
            <p>NIF: {issuer?.issuer_tax_id || pending}</p>
            <p className="whitespace-pre-line">{issuer?.issuer_address || pending}</p>
            {issuer?.issuer_email && <p>{issuer.issuer_email}</p>}
            {issuer?.issuer_phone && <p>{issuer.issuer_phone}</p>}
          </div>
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-[#5b6477] uppercase">
              Cliente
            </p>
            <p className="mt-1 font-semibold">{to.name || pending}</p>
            {to.trade_name && to.trade_name !== to.name && <p>{to.trade_name}</p>}
            <p>NIF: {to.tax_id || pending}</p>
            <p className="whitespace-pre-line">{to.address || pending}</p>
            {to.email && <p>{to.email}</p>}
          </div>
        </section>

        <dl className="mt-6 grid grid-cols-3 gap-4 rounded-md bg-[#f3f5f9] p-3 text-[12px]">
          <div>
            <dt className="text-[#5b6477]">Fecha de emisión</dt>
            <dd className="font-semibold">{invoice.issued_on ? day(invoice.issued_on) : "—"}</dd>
          </div>
          <div>
            <dt className="text-[#5b6477]">Vencimiento</dt>
            <dd className="font-semibold">{day(invoice.due_on)}</dd>
          </div>
          <div>
            <dt className="text-[#5b6477]">Estado</dt>
            <dd className="font-semibold">{INVOICE_STATUSES[invoice.status]}</dd>
          </div>
        </dl>

        <table className="mt-6 w-full">
          <thead>
            <tr className="border-b border-[#0f1b33] text-left text-[11px] tracking-wider text-[#5b6477] uppercase">
              <th className="py-2 font-semibold">Concepto</th>
              <th className="py-2 text-right font-semibold">Importe</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[#d9dee8] align-top">
              <td className="py-3 pr-4">
                {invoice.concept}
                {period && (
                  <span className="block text-[12px] text-[#5b6477]">Periodo: {period}</span>
                )}
              </td>
              <td className="py-3 text-right tabular-nums">{eur(invoice.base)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-4 ml-auto w-64 space-y-1 text-right tabular-nums">
          <p className="flex justify-between">
            <span className="text-[#5b6477]">Base imponible</span> {eur(invoice.base)}
          </p>
          <p className="flex justify-between">
            <span className="text-[#5b6477]">IVA {Number(invoice.vat_rate)} %</span> {eur(vat)}
          </p>
          <p className="flex justify-between border-t-2 border-[#0f1b33] pt-2 text-base font-bold">
            <span>Total</span> {eur(invoice.total)}
          </p>
        </div>

        <section className="mt-8 text-[12px]">
          <p className="font-semibold">Forma de pago</p>
          <p>
            {issuer?.iban ? (
              <>
                Transferencia a <span className="font-mono">{issuer.iban}</span>, indicando{" "}
                {invoice.number ?? "el número de factura"}.
              </>
            ) : (
              "Transferencia bancaria (cuenta pendiente de indicar)."
            )}
          </p>
          {invoice.status === "paid" && invoice.paid_on && (
            <p className="mt-1">
              Cobrada el {day(invoice.paid_on)}
              {invoice.method ? ` (${invoice.method.toLowerCase()})` : ""}.
            </p>
          )}
        </section>

        <footer className="mt-auto border-t border-[#d9dee8] pt-4 text-[11px] text-[#5b6477]">
          {issuer?.invoice_note && (
            <p className="mb-1 whitespace-pre-line">{issuer.invoice_note}</p>
          )}
          <p>{BRAND} · PMS y motor de reservas para hoteles y hostales · os.melendo.app</p>
        </footer>
      </article>
    </div>
  );
}
