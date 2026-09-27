import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { FOREIGN_ID_TYPES, INVOICE_TYPES, lineTotal } from "@domain/invoicing.ts";
import { QR_CAPTION, VERIFACTU_LEGEND } from "@domain/verifactu.ts";
import type { TaxInvoice } from "@/lib/invoices";

const money = (n: number) =>
  Number(n).toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
const date = (ymd: string) => ymd.split("-").reverse().join("/");

/** The tax QR: ISO/IEC 18004, error correction M, 30-40 mm (Orden HAC/1177/2024, art. 21). */
function TaxQr({ url }: { url: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 0 })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(null));
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <p className="text-sm font-medium">{QR_CAPTION}</p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label="Cotejar la factura en la sede de la AEAT"
      >
        <div
          className="bg-white p-[2mm] [&>svg]:h-full [&>svg]:w-full"
          style={{ width: "39mm", height: "39mm" }}
          // The SVG is generated locally from the invoice's own URL.
          dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
        />
      </a>
      <p className="text-sm font-semibold tracking-wide">{VERIFACTU_LEGEND}</p>
    </div>
  );
}

/**
 * A printable invoice. The tax QR goes first, at the top, as the AEAT asks
 * ("QR tributario:" above it, "VERI*FACTU" below).
 */
export function InvoiceDocument({
  invoice: i,
  related = [],
}: {
  invoice: TaxInvoice;
  related?: { id: string; number: string; issue_date: string }[];
}) {
  const rel = (id: string) => related.find((r) => r.id === id);
  const r = i.recipient;
  return (
    <article className="invoice-doc mx-auto w-full max-w-[210mm] space-y-6 bg-white p-8 text-[13px] leading-relaxed text-neutral-900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
      <TaxQr url={i.qr_url} />

      {i.environment !== "prod" && (
        <p className="border border-dashed border-neutral-400 px-3 py-1.5 text-center text-xs uppercase tracking-wider text-neutral-500">
          {i.environment === "simulated"
            ? "Factura de demostración · sin validez fiscal"
            : "Entorno de pruebas de la AEAT · sin validez fiscal"}
        </p>
      )}
      {i.status === "cancelled" && (
        <p className="border border-red-300 bg-red-50 px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wider text-red-700">
          Factura anulada{i.cancel_reason ? ` · ${i.cancel_reason}` : ""}
        </p>
      )}

      <header className="flex flex-wrap items-start justify-between gap-6 border-b pb-4">
        <div>
          <p className="text-lg font-semibold">{i.issuer_name}</p>
          <p>NIF {i.issuer_nif}</p>
          {i.issuer_address && <p className="whitespace-pre-line">{i.issuer_address}</p>}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            {INVOICE_TYPES[i.type]}
          </p>
          <p className="text-xl font-semibold tabular-nums">{i.number}</p>
          <p>Fecha de expedición: {date(i.issue_date)}</p>
        </div>
      </header>

      {r && (
        <section>
          <p className="text-xs uppercase tracking-wider text-neutral-500">Cliente</p>
          <p className="font-medium">{r.name}</p>
          <p>
            {r.nif
              ? `NIF ${r.nif}`
              : `${FOREIGN_ID_TYPES[r.id_type as keyof typeof FOREIGN_ID_TYPES] ?? "Documento"} ${r.id_number ?? ""} · ${r.country ?? ""}`}
          </p>
          {r.address && <p className="whitespace-pre-line">{r.address}</p>}
        </section>
      )}

      {(i.corrects_id || i.replaces_ids?.length) && (
        <section className="text-sm">
          {i.corrects_id && (
            <p>
              Rectifica la factura {rel(i.corrects_id)?.number ?? ""}
              {rel(i.corrects_id) ? ` de ${date(rel(i.corrects_id)!.issue_date)}` : ""} (por
              diferencias).
              {i.reason ? ` Motivo: ${i.reason}.` : ""}
            </p>
          )}
          {i.replaces_ids?.length ? (
            <p>
              Sustituye a la factura simplificada{" "}
              {i.replaces_ids.map((id) => rel(id)?.number ?? "").join(", ")}.
            </p>
          ) : null}
        </section>
      )}

      <section>
        <p className="mb-2 font-medium">{i.description}</p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-neutral-500">
              <th className="py-1.5 font-medium">Concepto</th>
              <th className="py-1.5 text-right font-medium">Cant.</th>
              <th className="py-1.5 text-right font-medium">Precio (IVA incl.)</th>
              <th className="py-1.5 text-right font-medium">IVA</th>
              <th className="py-1.5 text-right font-medium">Importe</th>
            </tr>
          </thead>
          <tbody>
            {i.lines.map((l, n) => (
              <tr key={n} className="border-b border-neutral-100">
                <td className="py-1.5 pr-2">{l.description}</td>
                <td className="py-1.5 text-right tabular-nums">{Number(l.qty)}</td>
                <td className="py-1.5 text-right tabular-nums">{money(l.unit_price)}</td>
                <td className="py-1.5 text-right tabular-nums">{Number(l.vat_rate)} %</td>
                <td className="py-1.5 text-right tabular-nums">{money(lineTotal(l))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="ml-auto w-full max-w-xs space-y-1">
        {i.breakdown.map((b) => (
          <div key={b.rate} className="flex justify-between tabular-nums text-neutral-600">
            <span>
              Base {Number(b.rate)} % · IVA {money(b.tax)}
            </span>
            <span>{money(b.base)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t pt-1 tabular-nums">
          <span>Base imponible</span>
          <span>{money(i.base)}</span>
        </div>
        <div className="flex justify-between tabular-nums">
          <span>Cuota de IVA</span>
          <span>{money(i.tax)}</span>
        </div>
        <div className="flex justify-between border-t pt-1 text-base font-semibold tabular-nums">
          <span>Total</span>
          <span>{money(i.total)}</span>
        </div>
      </section>
    </article>
  );
}
