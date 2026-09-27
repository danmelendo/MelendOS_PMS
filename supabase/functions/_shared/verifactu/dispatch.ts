// Sends a hotel's pending billing records to the AEAT, in chain order, and
// keeps its answer (state, error, CSV). Flow control (Orden HAC/1177/2024,
// art. 16.2): after a send, wait the seconds the AEAT answered
// (TiempoEsperaEnvio, 60 by default) unless 1.000 records are waiting.
// A failed call (network, SOAP fault) leaves the records pending for the next
// run: resending the same record is not a new record.
import { aeatAmount } from "../domain/verifactu.ts";
import type { Environment, VerifactuTransport } from "./transport.ts";
import { buildRequest, type InvoiceRef, type RecordXml, type SistemaInformatico } from "./xml.ts";

export const MAX_RECORDS = 1000;

export interface VfRecord {
  id: string;
  tenant_id: string;
  invoice_id: string;
  seq: number;
  kind: "alta" | "anulacion";
  subsanacion: boolean;
  rechazo_previo: "X" | null;
  sin_registro_previo: boolean;
  issuer_nif: string;
  invoice_number: string;
  issue_date: string; // dd-mm-yyyy
  invoice_type: string | null;
  cuota_total: string | null;
  importe_total: string | null;
  prev_hash: string | null;
  prev_issuer_nif: string | null;
  prev_number: string | null;
  prev_issue_date: string | null;
  generated_at: string;
  hash: string;
  environment: Environment;
  attempts: number;
}

export interface VfInvoice {
  id: string;
  type: string;
  number: string;
  issue_date: string; // yyyy-mm-dd
  issuer_nif: string;
  issuer_name: string;
  recipient: RecordXml["recipient"];
  description: string;
  breakdown: { rate: number; base: number; tax: number }[];
  corrects_id: string | null;
  replaces_ids: string[] | null;
}

export interface VfSettings {
  tenant_id: string;
  installation_number: string | null;
  next_send_at: string | null;
}

export type RecordPatch = {
  status?: "pending" | "accepted" | "accepted_with_errors" | "rejected";
  error_code?: string | null;
  error?: string | null;
  csv?: string | null;
  attempts?: number;
  last_attempt_at?: string;
  sent_at?: string;
};

export interface VerifactuStore {
  settings(tenantId: string): Promise<VfSettings | null>;
  pending(tenantId: string, limit: number): Promise<VfRecord[]>;
  invoices(ids: string[]): Promise<VfInvoice[]>;
  certificate(tenantId: string): Promise<{ cert: string; key: string } | null>;
  updateRecord(id: string, patch: RecordPatch): Promise<void>;
  setFlow(tenantId: string, waitSeconds: number, nextSendAt: string): Promise<void>;
}

export interface DispatchReport {
  sent: number;
  accepted: number;
  withErrors: number;
  rejected: number;
  failed: number;
  waiting: boolean;
}

const ddmmyyyy = (ymd: string) => ymd.split("-").reverse().join("-");
const ref = (i: VfInvoice): InvoiceRef => ({
  nif: i.issuer_nif,
  number: i.number,
  date: ddmmyyyy(i.issue_date),
});

/** The XML data of a record from its row and its invoice. */
export function toRecordXml(r: VfRecord, inv: VfInvoice, byId: Map<string, VfInvoice>): RecordXml {
  const previous =
    r.prev_hash && r.prev_number && r.prev_issue_date
      ? {
          nif: r.prev_issuer_nif ?? r.issuer_nif,
          number: r.prev_number,
          date: r.prev_issue_date,
          hash: r.prev_hash,
        }
      : null;
  const common = {
    id: r.id,
    kind: r.kind,
    subsanacion: r.subsanacion,
    rechazo_previo: r.rechazo_previo,
    sin_registro_previo: r.sin_registro_previo,
    issuer: { nif: inv.issuer_nif, name: inv.issuer_name },
    invoice: { nif: r.issuer_nif, number: r.invoice_number, date: r.issue_date },
    previous,
    generated_at: r.generated_at,
    hash: r.hash,
  };
  if (r.kind === "anulacion") return common;
  const others = (ids: (string | null)[] | null) =>
    (ids ?? []).flatMap((id) => {
      const o = id ? byId.get(id) : undefined;
      return o ? [ref(o)] : [];
    });
  return {
    ...common,
    type: r.invoice_type ?? inv.type,
    description: inv.description,
    // Simplified invoices and their rectifications carry no recipient.
    recipient: inv.type === "F2" || inv.type === "R5" ? null : inv.recipient,
    rectified: others([inv.corrects_id]),
    replaced: others(inv.replaces_ids),
    breakdown: inv.breakdown.map((b) => ({
      rate: Number(b.rate),
      base: aeatAmount(b.base),
      tax: aeatAmount(b.tax),
    })),
    cuota_total: r.cuota_total ?? undefined,
    importe_total: r.importe_total ?? undefined,
  };
}

/** One run for a hotel. */
export async function dispatchTenant(
  store: VerifactuStore,
  transport: (env: Environment, cert: { cert: string; key: string } | null) => VerifactuTransport,
  sif: Omit<SistemaInformatico, "installation">,
  tenantId: string,
  now = new Date(),
): Promise<DispatchReport> {
  const report: DispatchReport = {
    sent: 0,
    accepted: 0,
    withErrors: 0,
    rejected: 0,
    failed: 0,
    waiting: false,
  };
  const s = await store.settings(tenantId);
  if (!s?.installation_number) return report;
  const rows = await store.pending(tenantId, MAX_RECORDS);
  if (!rows.length) return report;
  if (s.next_send_at && Date.parse(s.next_send_at) > now.getTime() && rows.length < MAX_RECORDS) {
    report.waiting = true;
    return report;
  }

  // One send: the oldest records of one environment and issuer, one record
  // per invoice (a later record of the same invoice goes in the next send).
  const first = rows[0];
  const seen = new Set<string>();
  const batch = rows.filter((r) => {
    if (
      r.environment !== first.environment ||
      r.issuer_nif !== first.issuer_nif ||
      seen.has(r.invoice_id)
    )
      return false;
    seen.add(r.invoice_id);
    return true;
  });
  const direct = await store.invoices([...new Set(batch.map((r) => r.invoice_id))]);
  const extra = direct
    .flatMap((i) => [i.corrects_id, ...(i.replaces_ids ?? [])])
    .filter((x): x is string => !!x);
  const all = extra.length ? [...direct, ...(await store.invoices([...new Set(extra)]))] : direct;
  const byId = new Map(all.map((i) => [i.id, i]));
  const records = batch.map((r) => toRecordXml(r, byId.get(r.invoice_id)!, byId));
  const issuer = records[0].issuer;
  const xml = buildRequest(issuer, records, { ...sif, installation: s.installation_number });

  const stamp = now.toISOString();
  const fail = async (message: string) => {
    for (const r of batch)
      await store.updateRecord(r.id, {
        error: message,
        attempts: r.attempts + 1,
        last_attempt_at: stamp,
      });
    await store.setFlow(tenantId, 60, new Date(now.getTime() + 60_000).toISOString());
    report.failed += batch.length;
    return report;
  };
  let res;
  try {
    const cert = first.environment === "simulated" ? null : await store.certificate(tenantId);
    res = await transport(first.environment, cert).send(xml);
  } catch (e) {
    return fail((e as Error).message);
  }
  if (res.fault) return fail(`AEAT: ${res.fault}`);

  const wait = Math.max(0, Math.min(3600, res.wait ?? 60));
  await store.setFlow(tenantId, wait, new Date(now.getTime() + wait * 1000).toISOString());
  for (const r of batch) {
    const line = res.lines.find((l) => l.ref === r.id);
    const base = { attempts: r.attempts + 1, last_attempt_at: stamp, sent_at: stamp };
    if (!line) {
      await store.updateRecord(r.id, {
        ...base,
        error: "Sin respuesta de la AEAT para este registro",
      });
      report.failed++;
      continue;
    }
    report.sent++;
    const duplicateOk =
      line.duplicateState === "Correcta" || line.duplicateState === "AceptadaConErrores";
    if (line.state === "Correcto" || (line.state === "Incorrecto" && duplicateOk)) {
      await store.updateRecord(r.id, {
        ...base,
        status:
          duplicateOk && line.duplicateState === "AceptadaConErrores"
            ? "accepted_with_errors"
            : "accepted",
        csv: res.csv,
        error_code: null,
        error: duplicateOk ? "Ya estaba registrado en la AEAT" : null,
      });
      report.accepted++;
    } else if (line.state === "AceptadoConErrores") {
      await store.updateRecord(r.id, {
        ...base,
        status: "accepted_with_errors",
        csv: res.csv,
        error_code: line.code,
        error: line.description,
      });
      report.withErrors++;
    } else {
      await store.updateRecord(r.id, {
        ...base,
        status: "rejected",
        error_code: line.code,
        error: line.description,
      });
      report.rejected++;
    }
  }
  return report;
}
