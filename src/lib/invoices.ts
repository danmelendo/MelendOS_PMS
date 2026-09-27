import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { InvoiceLine, InvoiceType, Recipient, TaxRow } from "@domain/invoicing.ts";

// Invoices with VERI*FACTU for the panel: issuing from a stay's bill, the list
// with the AEAT's answer for each record, and the hotel's fiscal set-up
// (docs/verifactu.md).

export interface TaxInvoice {
  id: string;
  tenant_id: string;
  reservation_id: string | null;
  type: InvoiceType;
  number: string;
  issue_date: string;
  issuer_nif: string;
  issuer_name: string;
  issuer_address: string | null;
  recipient: Recipient | null;
  description: string;
  lines: InvoiceLine[];
  breakdown: TaxRow[];
  base: number;
  tax: number;
  total: number;
  corrects_id: string | null;
  replaces_ids: string[] | null;
  reason: string | null;
  status: "issued" | "replaced" | "cancelled";
  cancel_reason: string | null;
  qr_url: string;
  environment: "simulated" | "pre" | "prod";
  created_at: string;
}

export type RecordStatus = "pending" | "accepted" | "accepted_with_errors" | "rejected";

export interface VerifactuRecord {
  id: string;
  invoice_id: string;
  seq: number;
  kind: "alta" | "anulacion";
  subsanacion: boolean;
  status: RecordStatus;
  error_code: string | null;
  error: string | null;
  csv: string | null;
  attempts: number;
  sent_at: string | null;
  created_at: string;
}

export const RECORD_STATUS: Record<
  RecordStatus,
  { label: string; tone: "info" | "ok" | "warn" | "bad" }
> = {
  pending: { label: "Enviando a la AEAT", tone: "info" },
  accepted: { label: "Registrada en la AEAT", tone: "ok" },
  accepted_with_errors: { label: "Aceptada con errores", tone: "warn" },
  rejected: { label: "Rechazada por la AEAT", tone: "bad" },
};

export const INVOICE_STATUS: Record<TaxInvoice["status"], string> = {
  issued: "Vigente",
  replaced: "Canjeada",
  cancelled: "Anulada",
};

export interface FiscalSettings {
  tenant_id: string;
  enabled: boolean;
  environment: "simulated" | "pre" | "prod";
  issuer_nif: string | null;
  issuer_name: string | null;
  issuer_address: string | null;
  installation_number: string | null;
  simplified_limit: number;
  has_certificate: boolean;
  wait_seconds: number;
  next_send_at: string | null;
}

const unwrap = <T>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

export function useFiscalSettings(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["invoices", "settings", tenantId],
    enabled: !!tenantId,
    queryFn: async () =>
      unwrap(
        await supabase.from("fiscal_settings").select("*").eq("tenant_id", tenantId!).maybeSingle(),
      ) as FiscalSettings | null,
  });
}

/** Last record (the AEAT's latest answer) of each invoice. */
function lastRecords(records: VerifactuRecord[]) {
  const m = new Map<string, VerifactuRecord>();
  for (const r of records) {
    const cur = m.get(r.invoice_id);
    if (!cur || r.seq > cur.seq) m.set(r.invoice_id, r);
  }
  return m;
}

async function withRecords(invoices: TaxInvoice[]) {
  if (!invoices.length) return [];
  const records = unwrap(
    await supabase
      .from("verifactu_records")
      .select(
        "id, invoice_id, seq, kind, subsanacion, status, error_code, error, csv, attempts, sent_at, created_at",
      )
      .in(
        "invoice_id",
        invoices.map((i) => i.id),
      ),
  ) as VerifactuRecord[];
  const last = lastRecords(records);
  return invoices.map((i) => ({ ...i, record: last.get(i.id) ?? null }));
}
export type InvoiceWithRecord = TaxInvoice & { record: VerifactuRecord | null };

export function useInvoices(tenantId: string | null, search: string) {
  return useQuery({
    queryKey: ["invoices", "list", tenantId, search],
    enabled: !!tenantId,
    refetchInterval: 15_000,
    queryFn: async () => {
      let q = supabase
        .from("tax_invoices")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(200);
      const s = search.trim();
      if (s)
        q = q.or(
          `number.ilike.%${s.replace(/[%,()]/g, "")}%,recipient->>name.ilike.%${s.replace(/[%,()]/g, "")}%`,
        );
      return withRecords(unwrap(await q) as unknown as TaxInvoice[]);
    },
  });
}

export function useStayInvoices(reservationId: string | null) {
  return useQuery({
    queryKey: ["invoices", "stay", reservationId],
    enabled: !!reservationId,
    refetchInterval: 10_000,
    queryFn: async () =>
      withRecords(
        unwrap(
          await supabase
            .from("tax_invoices")
            .select("*")
            .eq("reservation_id", reservationId!)
            .order("created_at"),
        ) as unknown as TaxInvoice[],
      ),
  });
}

export function useInvoice(id: string | null) {
  return useQuery({
    queryKey: ["invoices", "one", id],
    enabled: !!id,
    queryFn: async () => {
      const inv = unwrap(
        await supabase.from("tax_invoices").select("*").eq("id", id!).maybeSingle(),
      ) as TaxInvoice | null;
      if (!inv) return null;
      const refs = [inv.corrects_id, ...(inv.replaces_ids ?? [])].filter((x): x is string => !!x);
      const related = refs.length
        ? (unwrap(
            await supabase.from("tax_invoices").select("id, number, issue_date").in("id", refs),
          ) as {
            id: string;
            number: string;
            issue_date: string;
          }[])
        : [];
      const [withRec] = await withRecords([inv]);
      return { ...withRec, related };
    },
  });
}

export interface InvoicePreview {
  lines: InvoiceLine[];
  totals: { rows: TaxRow[]; base: number; tax: number; total: number };
  pending_charges: number;
}

export function useInvoicePreview(reservationId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["invoices", "preview", reservationId],
    enabled: !!reservationId && enabled,
    queryFn: async () =>
      unwrap(
        await supabase.rpc("invoice_preview", { p_reservation: reservationId! }),
      ) as unknown as InvoicePreview,
  });
}

export function useInvoiceActions(tenantId: string | null | undefined) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["invoices"] });
  const rpc = async (fn: string, args: Record<string, unknown>) =>
    unwrap(await supabase.rpc(fn as never, args as never));
  return {
    issue: useMutation({
      mutationFn: (v: { reservationId: string; recipient: Recipient | null }) =>
        rpc("issue_invoice", {
          p_reservation: v.reservationId,
          p_recipient: v.recipient,
        }) as Promise<string>,
      onSettled: refresh,
    }),
    exchange: useMutation({
      mutationFn: (v: { invoiceId: string; recipient: Recipient }) =>
        rpc("exchange_simplified_invoice", {
          p_invoice: v.invoiceId,
          p_recipient: v.recipient,
        }) as Promise<string>,
      onSettled: refresh,
    }),
    rectify: useMutation({
      mutationFn: (v: {
        invoiceId: string;
        lines: Omit<InvoiceLine, "vat_rate">[] & { vat_rate?: number }[];
        reason: string;
      }) =>
        rpc("rectify_invoice", {
          p_invoice: v.invoiceId,
          p_lines: v.lines,
          p_reason: v.reason,
        }) as Promise<string>,
      onSettled: refresh,
    }),
    cancel: useMutation({
      mutationFn: (v: { invoiceId: string; reason: string }) =>
        rpc("cancel_invoice", { p_invoice: v.invoiceId, p_reason: v.reason }),
      onSettled: refresh,
    }),
    resubmit: useMutation({
      mutationFn: (v: { invoiceId: string; recipient?: Recipient | null }) =>
        rpc("resubmit_invoice", { p_invoice: v.invoiceId, p_recipient: v.recipient ?? null }),
      onSettled: refresh,
    }),
    dispatch: useMutation({
      mutationFn: async () => {
        const { data, error } = await supabase.functions.invoke("verifactu-dispatch", {
          body: { tenant_id: tenantId },
        });
        if (error) throw new Error(error.message);
        return (data.results?.[tenantId!] ?? {
          sent: 0,
          accepted: 0,
          rejected: 0,
          waiting: false,
        }) as {
          sent: number;
          accepted: number;
          withErrors: number;
          rejected: number;
          failed: number;
          waiting: boolean;
          error?: string;
        };
      },
      onSettled: refresh,
    }),
    saveSettings: useMutation({
      mutationFn: (data: Record<string, unknown>) =>
        rpc("save_fiscal_settings", { p_tenant: tenantId, p_data: data }),
      onSettled: refresh,
    }),
    saveCertificate: useMutation({
      mutationFn: (v: { cert: string; key: string }) =>
        rpc("save_verifactu_certificate", { p_tenant: tenantId, p_cert: v.cert, p_key: v.key }),
      onSettled: refresh,
    }),
  };
}

export const TONE: Record<string, string> = {
  info: "bg-info/15 text-info-foreground",
  ok: "bg-emerald-100 text-emerald-800",
  warn: "bg-gold/20 text-gold-foreground",
  bad: "bg-destructive/15 text-destructive",
};

export const openInvoice = (id: string) => window.open(`/invoice/${id}`, "_blank", "noopener");

/** Invoices of a stay for its guest (booking link token or member account). */
export function useGuestInvoices(reservationId: string, token: string | null) {
  return useQuery({
    queryKey: ["guest-invoices", reservationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_guest_invoices", {
        p_reservation_id: reservationId,
        p_token: token ?? undefined,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as TaxInvoice[];
    },
  });
}
