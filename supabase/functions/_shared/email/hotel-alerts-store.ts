// HotelAlertStore over Supabase (service role). Recipients come from
// hotel_alert_recipients(): the hotel's management (and group management),
// whose emails live in auth.users.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { HotelAlertStore, PendingNotice } from "./hotel-alerts.ts";

export function supabaseHotelAlertStore(db: SupabaseClient): HotelAlertStore {
  return {
    async pending(limit) {
      const { data, error } = await db
        .from("hotel_alert_notices")
        .select("id, tenant_id, kind, items, attempts")
        .eq("status", "pending")
        .is("resolved_at", null)
        .order("opened_at")
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as PendingNotice[];
    },
    async hotel(tenantId) {
      const [{ data: tenant }, { data: emails, error }] = await Promise.all([
        db.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
        db.rpc("hotel_alert_recipients", { p_tenant: tenantId }),
      ]);
      if (error) throw new Error(error.message);
      if (!tenant) return null;
      return {
        name: tenant.name as string,
        recipients: ((emails ?? []) as { email: string }[]).map((r) => r.email),
      };
    },
    async mark(ids, status, detail) {
      const { error } = await db.rpc("mark_hotel_alert_notices", {
        p_ids: ids,
        p_status: status,
        p_error: detail.error ?? null,
        p_attempt: !!detail.attempt,
      });
      if (error) throw new Error(error.message);
    },
  };
}
