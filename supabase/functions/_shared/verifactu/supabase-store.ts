// VerifactuStore on Supabase (service role: every query is scoped by tenant or
// by ids that belong to it).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { VerifactuStore, VfInvoice, VfRecord, VfSettings } from "./dispatch.ts";

export function supabaseVerifactuStore(db: SupabaseClient): VerifactuStore & {
  tenantsWithWork(tenantId: string | null): Promise<string[]>;
} {
  return {
    async tenantsWithWork(tenantId) {
      let q = db.from("verifactu_records").select("tenant_id").eq("status", "pending").limit(1000);
      if (tenantId) q = q.eq("tenant_id", tenantId);
      const { data, error } = await q;
      if (error) throw error;
      return [...new Set((data ?? []).map((r) => r.tenant_id as string))];
    },

    async settings(tenantId) {
      const { data, error } = await db
        .from("fiscal_settings")
        .select("tenant_id, installation_number, next_send_at")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return data as VfSettings | null;
    },

    async pending(tenantId, limit) {
      const { data, error } = await db
        .from("verifactu_records")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("status", "pending")
        .order("seq")
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as VfRecord[];
    },

    async invoices(ids) {
      if (!ids.length) return [];
      const { data, error } = await db
        .from("tax_invoices")
        .select(
          "id, type, number, issue_date, issuer_nif, issuer_name, recipient, description, breakdown, corrects_id, replaces_ids",
        )
        .in("id", ids);
      if (error) throw error;
      return (data ?? []) as VfInvoice[];
    },

    async certificate(tenantId) {
      const { data } = await db.rpc("verifactu_certificate", { p_tenant: tenantId });
      return (data as { cert: string; key: string } | null) ?? null;
    },

    async updateRecord(id, patch) {
      const { error } = await db.from("verifactu_records").update(patch).eq("id", id);
      if (error) throw error;
    },

    async setFlow(tenantId, waitSeconds, nextSendAt) {
      const { error } = await db
        .from("fiscal_settings")
        .update({ wait_seconds: waitSeconds, next_send_at: nextSendAt })
        .eq("tenant_id", tenantId);
      if (error) throw error;
    },
  };
}
