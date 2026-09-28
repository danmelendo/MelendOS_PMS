import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { sales } from "../lib/supabase";
import {
  INVOICE_STATUSES,
  day,
  eur,
  mrr,
  today,
  type Client,
  type ClientInvoice,
  type InvoiceStatus,
} from "../lib/clients";
import { BTN, BTN_OUTLINE, BTN_PRIMARY, FIELD, Stat } from "./admin-ui";

// Facturación: what we bill each client. Drafts are created on their due date
// by generate_client_invoices() (daily cron, or "Generar ahora"); here they are
// issued (correlative number, then immutable), marked paid or cancelled.

const STATUS_TONE: Record<InvoiceStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  issued: "bg-gold/20 text-gold-foreground",
  paid: "bg-primary text-primary-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

type Row = ClientInvoice & { clients: Pick<Client, "name"> | null };

export function BillingTab() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<InvoiceStatus | "open" | "">("open");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; action: "cancel" | "delete" } | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const db = sales();
    const [i, c] = await Promise.all([
      db
        .from("client_invoices")
        .select("*, clients(name)")
        .order("created_at", { ascending: false })
        .limit(2000),
      db.from("clients").select("*").order("name"),
    ]);
    if (i.error || c.error) return setError((i.error ?? c.error)!.message);
    setError(null);
    setRows(i.data as Row[]);
    setClients(c.data as Client[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(id);
    const { error } = await fn();
    setBusy(null);
    setConfirm(null);
    if (error) return setError(error.message);
    load();
  };
  const generate = async () => {
    setBusy("generate");
    const { data, error } = await sales().rpc("generate_client_invoices");
    setBusy(null);
    if (error) return setError(error.message);
    setNotice(data ? `${data} borradores nuevos.` : "No había ninguna cuota pendiente de generar.");
    load();
  };

  const now = today();
  const yearRows = (rows ?? []).filter((r) => (r.issued_on ?? r.created_at).startsWith(year));
  const shown = useMemo(
    () =>
      yearRows.filter((r) =>
        status === "open"
          ? r.status === "draft" || r.status === "issued"
          : !status || r.status === status,
      ),
    [yearRows, status],
  );
  const issued = (rows ?? []).filter((r) => r.status === "issued");
  const overdue = issued.filter((r) => r.due_on && r.due_on < now);
  const drafts = (rows ?? []).filter((r) => r.status === "draft");
  const cashed = yearRows
    .filter((r) => r.status === "paid")
    .reduce((s, r) => s + Number(r.total), 0);
  const monthly = clients.reduce((s, c) => s + mrr(c), 0);
  const years = [...new Set((rows ?? []).map((r) => (r.issued_on ?? r.created_at).slice(0, 4)))]
    .concat(String(new Date().getFullYear()))
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort()
    .reverse();

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={TrendingUp}
          label="MRR (sin IVA)"
          value={eur(monthly)}
          hint={`${eur(monthly * 12)} al año`}
        />
        <Stat
          icon={Wallet}
          label="Pendiente de cobro"
          value={eur(issued.reduce((s, r) => s + Number(r.total), 0))}
          hint={`${issued.length} facturas emitidas`}
        />
        <Stat
          icon={AlertTriangle}
          label="Vencidas"
          value={eur(overdue.reduce((s, r) => s + Number(r.total), 0))}
          hint={overdue.length ? `${overdue.length} facturas` : "ninguna"}
        />
        <Stat
          icon={CalendarClock}
          label={`Cobrado en ${year}`}
          value={eur(cashed)}
          hint="con IVA"
        />
      </div>

      {drafts.length > 0 && (
        <p className="rounded-xl border border-gold/50 bg-gold/10 p-3 text-sm">
          {drafts.length === 1 ? "Hay 1 borrador" : `Hay ${drafts.length} borradores`} por emitir (
          {eur(drafts.reduce((s, r) => s + Number(r.total), 0))}). Revísalos y pulsa «Emitir».
        </p>
      )}

      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <select
            aria-label="Estado"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className={FIELD}
          >
            <option value="open">Por emitir o cobrar</option>
            <option value="">Todas</option>
            {Object.entries(INVOICE_STATUSES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            aria-label="Año"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className={FIELD}
          >
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={generate}
              disabled={busy === "generate"}
              className={BTN_OUTLINE}
            >
              {busy === "generate" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}{" "}
              Generar cuotas pendientes
            </button>
            <button type="button" onClick={() => setAdding((a) => !a)} className={BTN_OUTLINE}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Factura manual
            </button>
            <button
              type="button"
              onClick={() => downloadCsv(shown)}
              disabled={!shown.length}
              className={BTN_OUTLINE}
            >
              <Download className="h-4 w-4" aria-hidden="true" /> CSV
            </button>
          </div>
        </div>
        {adding && (
          <ManualInvoice
            clients={clients}
            onDone={() => {
              setAdding(false);
              load();
            }}
          />
        )}
        {notice && <p className="border-b px-4 py-2 text-sm text-muted-foreground">{notice}</p>}
        {error && <p className="p-4 text-sm text-destructive">{error}</p>}
        {rows === null ? (
          <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando facturas…
          </p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {rows.length
              ? "Nada con este filtro."
              : "Aún no hay facturas. Se generan solas con los clientes activos."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-sm">
              <thead>
                <tr className="border-b bg-muted text-left">
                  <th className="px-3 py-2 font-medium">Número</th>
                  <th className="px-3 py-2 font-medium">Cliente · concepto</th>
                  <th className="px-3 py-2 text-right font-medium">Base</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 font-medium">Vence</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const late = r.status === "issued" && r.due_on && r.due_on < now;
                  const asking = confirm?.id === r.id ? confirm.action : null;
                  return (
                    <tr key={r.id} className="border-b align-top last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                        {r.number ?? <span className="text-muted-foreground">borrador</span>}
                        {r.issued_on && (
                          <span className="block text-xs text-muted-foreground">
                            {day(r.issued_on)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{r.clients?.name ?? "—"}</span>
                        <span className="block text-xs text-muted-foreground">{r.concept}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{eur(r.base)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {eur(r.total)}
                        <span className="block text-xs text-muted-foreground">
                          IVA {Number(r.vat_rate)} %
                        </span>
                      </td>
                      <td
                        className={`px-3 py-2 whitespace-nowrap ${late ? "font-semibold text-destructive" : ""}`}
                      >
                        {day(r.due_on)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS_TONE[r.status]}`}
                        >
                          {INVOICE_STATUSES[r.status]}
                        </span>
                        {r.paid_on && (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {day(r.paid_on)}
                            {r.method && ` · ${r.method}`}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {asking ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs">
                              {asking === "delete" ? "¿Borrar el borrador?" : "¿Anular la factura?"}
                            </span>
                            <button
                              type="button"
                              className={`${BTN} bg-destructive text-white`}
                              onClick={() =>
                                act(r.id, () =>
                                  asking === "delete"
                                    ? sales().from("client_invoices").delete().eq("id", r.id)
                                    : sales()
                                        .from("client_invoices")
                                        .update({ status: "cancelled" })
                                        .eq("id", r.id),
                                )
                              }
                            >
                              Sí
                            </button>
                            <button
                              type="button"
                              className={BTN_OUTLINE}
                              onClick={() => setConfirm(null)}
                            >
                              No
                            </button>
                          </span>
                        ) : r.status === "draft" ? (
                          <span className="inline-flex gap-1">
                            <button
                              type="button"
                              disabled={busy === r.id}
                              className={BTN_PRIMARY}
                              onClick={() =>
                                act(r.id, () =>
                                  sales().rpc("issue_client_invoice", { p_invoice: r.id }),
                                )
                              }
                            >
                              Emitir
                            </button>
                            <button
                              type="button"
                              aria-label="Borrar borrador"
                              className="rounded-md p-2 hover:bg-muted"
                              onClick={() => setConfirm({ id: r.id, action: "delete" })}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </button>
                          </span>
                        ) : r.status === "issued" ? (
                          <PaidButton
                            busy={busy === r.id}
                            onPaid={(method) =>
                              act(r.id, () =>
                                sales()
                                  .from("client_invoices")
                                  .update({ status: "paid", paid_on: today(), method })
                                  .eq("id", r.id),
                              )
                            }
                            onCancel={() => setConfirm({ id: r.id, action: "cancel" })}
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          Registro de lo que facturamos y cobramos. Una factura emitida no se modifica: si hay un
          error, se anula y se hace otra. Cuando Melend/OS facture como empresa, las facturas
          legales tendrán que salir de un sistema VERI*FACTU.
        </p>
      </section>
    </main>
  );
}

function PaidButton({
  busy,
  onPaid,
  onCancel,
}: {
  busy: boolean;
  onPaid: (method: string) => void;
  onCancel: () => void;
}) {
  const [method, setMethod] = useState("Transferencia");
  return (
    <span className="inline-flex items-center gap-1">
      <select
        aria-label="Forma de pago"
        className={`${FIELD} h-8 w-36`}
        value={method}
        onChange={(e) => setMethod(e.target.value)}
      >
        <option>Transferencia</option>
        <option>Domiciliación</option>
        <option>Tarjeta</option>
        <option>Otro</option>
      </select>
      <button type="button" disabled={busy} className={BTN_PRIMARY} onClick={() => onPaid(method)}>
        Cobrada
      </button>
      <button
        type="button"
        className={`${BTN} text-destructive hover:bg-destructive/10`}
        onClick={onCancel}
      >
        Anular
      </button>
    </span>
  );
}

function ManualInvoice({ clients, onDone }: { clients: Client[]; onDone: () => void }) {
  const [clientId, setClientId] = useState("");
  const [concept, setConcept] = useState("");
  const [base, setBase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const client = clients.find((c) => c.id === clientId);
  const submit = async () => {
    const amount = Number(base.replace(",", "."));
    if (!client || !concept.trim() || !(amount >= 0))
      return setError("Elige cliente, concepto e importe.");
    const { error } = await sales()
      .from("client_invoices")
      .insert({
        client_id: client.id,
        kind: "other",
        concept: concept.trim(),
        base: amount,
        vat_rate: client.vat_rate,
        due_on: new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10),
      });
    if (error) return setError(error.message);
    onDone();
  };
  return (
    <div className="flex flex-wrap items-end gap-2 border-b bg-muted/40 p-3">
      <select
        aria-label="Cliente"
        className={FIELD}
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
      >
        <option value="">Cliente…</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        className={`${FIELD} min-w-64 flex-1`}
        placeholder="Concepto (p. ej. integración a medida, 6 h)"
        value={concept}
        onChange={(e) => setConcept(e.target.value)}
      />
      <input
        className={`${FIELD} w-32`}
        inputMode="decimal"
        placeholder="Base (€)"
        value={base}
        onChange={(e) => setBase(e.target.value)}
      />
      <button type="button" className={BTN_PRIMARY} onClick={submit}>
        Crear borrador
      </button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}

function downloadCsv(rows: Row[]) {
  const cols: [string, (r: Row) => unknown][] = [
    ["numero", (r) => r.number ?? ""],
    ["fecha", (r) => r.issued_on ?? ""],
    ["cliente", (r) => r.clients?.name ?? ""],
    ["concepto", (r) => r.concept],
    ["base", (r) => String(r.base).replace(".", ",")],
    ["iva", (r) => r.vat_rate],
    ["total", (r) => String(r.total).replace(".", ",")],
    ["estado", (r) => INVOICE_STATUSES[r.status]],
    ["vence", (r) => r.due_on ?? ""],
    ["cobrada", (r) => r.paid_on ?? ""],
    ["forma de pago", (r) => r.method ?? ""],
  ];
  const cell = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [
    cols.map(([h]) => h).join(";"),
    ...rows.map((r) => cols.map(([, f]) => cell(f(r))).join(";")),
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `facturas-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
