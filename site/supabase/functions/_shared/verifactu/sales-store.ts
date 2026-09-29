// VerifactuStore over the sales project: Melend/OS is the only issuer (its
// "tenant" is the constant SALES_ISSUER), the records live in
// sales_verifactu_records, the invoices in client_invoices and the settings
// in sales_settings. Service role only.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { VerifactuStore, VfInvoice, VfRecord } from "./dispatch.ts";

export const SALES_ISSUER = "melendos";

interface InvoiceRow {
  id: string;
  number: string;
  issued_on: string;
  concept: string;
  base: number;
  vat_rate: number;
  total: number;
  issuer: { issuer_name?: string | null; issuer_tax_id?: string | null } | null;
  recipient: { name?: string | null; tax_id?: string | null } | null;
}

const taxId = (v: string | null | undefined) => (v ?? "").toUpperCase().replace(/[\s.-]/g, "");

export function salesVerifactuStore(db: SupabaseClient): VerifactuStore {
  const fail = (e: { message: string } | null) => {
    if (e) throw new Error(e.message);
  };
  return {
    async settings() {
      const { data, error } = await db
        .from("sales_settings")
        .select("installation_number, verifactu_next_send_at")
        .maybeSingle();
      fail(error);
      return data
        ? {
            tenant_id: SALES_ISSUER,
            installation_number: data.installation_number,
            next_send_at: data.verifactu_next_send_at,
          }
        : null;
    },
    async pending(_tenant, limit) {
      const { data, error } = await db
        .from("sales_verifactu_records")
        .select("*")
        .eq("status", "pending")
        .order("seq")
        .limit(limit);
      fail(error);
      return (data ?? []) as VfRecord[];
    },
    async invoices(ids) {
      const { data, error } = await db
        .from("client_invoices")
        .select("id, number, issued_on, concept, base, vat_rate, total, issuer, recipient")
        .in("id", ids);
      fail(error);
      return ((data ?? []) as InvoiceRow[]).map(
        (i): VfInvoice => ({
          id: i.id,
          type: "F1",
          number: i.number,
          issue_date: i.issued_on,
          issuer_nif: taxId(i.issuer?.issuer_tax_id),
          issuer_name: i.issuer?.issuer_name ?? "",
          recipient: { name: i.recipient?.name ?? "", nif: taxId(i.recipient?.tax_id) },
          description: i.concept,
          breakdown: [
            {
              rate: Number(i.vat_rate),
              base: Number(i.base),
              tax: Math.round((Number(i.total) - Number(i.base)) * 100) / 100,
            },
          ],
          corrects_id: null,
          replaces_ids: null,
        }),
      );
    },
    async certificate() {
      const { data, error } = await db.rpc("sales_verifactu_certificate");
      fail(error);
      return (data as { cert: string; key: string } | null) ?? null;
    },
    async updateRecord(id, patch) {
      const { error } = await db.from("sales_verifactu_records").update(patch).eq("id", id);
      fail(error);
    },
    async setFlow(_tenant, waitSeconds, nextSendAt) {
      const { error } = await db
        .from("sales_settings")
        .update({ verifactu_wait_seconds: waitSeconds, verifactu_next_send_at: nextSendAt })
        .eq("id", true);
      fail(error);
    },
  };
}
