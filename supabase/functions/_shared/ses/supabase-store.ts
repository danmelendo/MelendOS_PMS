// SesStore on Supabase (service role: every query is scoped by tenant or by a
// row that belongs to it).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { SesTraveller } from "../domain/ses.ts";
import type { SesBookingData, SesRow, SesStore } from "./dispatch.ts";
import type { SesConfig, SesEnvironment } from "./transport.ts";

const COLUMNS =
  "id, tenant_id, reservation_id, kind, operation, status, batch, batch_order, ses_code, attempts, target_id";

export function supabaseSesStore(db: SupabaseClient): SesStore & {
  enabledTenants(tenantId: string | null): Promise<string[]>;
  config(tenantId: string): Promise<SesConfig | null>;
} {
  return {
    async enabledTenants(tenantId) {
      let q = db.from("ses_settings").select("tenant_id").eq("enabled", true);
      if (tenantId) q = q.eq("tenant_id", tenantId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => r.tenant_id as string);
    },

    async config(tenantId) {
      const { data: s, error } = await db
        .from("ses_settings")
        .select("environment, landlord_code, app_name")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw error;
      if (!s) return null;
      const { data: creds } = await db.rpc("ses_credentials", { p_tenant: tenantId });
      return {
        environment: s.environment as SesEnvironment,
        landlordCode: s.landlord_code ?? "",
        appName: s.app_name,
        credentials: (creds as SesConfig["credentials"]) ?? null,
      };
    },

    async awaiting(tenantId) {
      const { data, error } = await db
        .from("ses_communications")
        .select(COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("status", "sent")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as SesRow[];
    },

    async due(tenantId) {
      const { data, error } = await db
        .from("ses_communications")
        .select(COLUMNS)
        .eq("tenant_id", tenantId)
        .or("status.in.(pending,blocked),and(status.eq.error,attempts.lt.5)")
        .order("created_at")
        .limit(500);
      if (error) throw error;
      const rows = (data ?? []) as SesRow[];
      // Cancellations need the code of what they cancel.
      const targetIds = rows.flatMap((r) => (r.target_id ? [r.target_id] : []));
      const { data: targets, error: tErr } = targetIds.length
        ? await db.from("ses_communications").select("id, ses_code, status").in("id", targetIds)
        : { data: [], error: null };
      if (tErr) throw tErr;
      const byId = new Map((targets ?? []).map((t) => [t.id as string, t]));
      return rows.map((r) => {
        const t = r.target_id ? byId.get(r.target_id) : undefined;
        return {
          ...r,
          target_code: (t?.ses_code as string | null) ?? null,
          target_status: (t?.status as SesRow["status"] | null) ?? null,
        };
      });
    },

    async bookingData(reservationId) {
      const { data: r, error } = await db
        .from("reservations")
        .select(
          "tenant_id, property_id, reference, created_at, start_at, end_at, people, payment_mode, channel_id, customer:customers(name, phone, email), tenant:tenants(settings)",
        )
        .eq("id", reservationId)
        .maybeSingle();
      if (error) throw error;
      if (!r) return null;
      const [{ data: est }, { data: travellers, error: tErr }] = await Promise.all([
        r.property_id
          ? db
              .from("ses_establishments")
              .select("code")
              .eq("tenant_id", r.tenant_id)
              .eq("property_id", r.property_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        db
          .from("stay_travellers")
          .select("*")
          .eq("reservation_id", reservationId)
          .order("is_holder", { ascending: false })
          .order("created_at"),
      ]);
      if (tErr) throw tErr;
      const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
      const settings = one(
        r.tenant as unknown as { settings: Record<string, unknown> } | null,
      )?.settings;
      return {
        reference: r.reference,
        created_at: r.created_at,
        start_at: r.start_at,
        end_at: r.end_at,
        people: r.people,
        payment_mode: r.payment_mode,
        channel_id: r.channel_id,
        timezone: (settings?.timezone as string) ?? "Europe/Madrid",
        establishment_code: (est as { code: string } | null)?.code ?? null,
        customer: one(r.customer as unknown as SesBookingData["customer"]),
        travellers: (travellers ?? []) as SesTraveller[],
      } satisfies SesBookingData;
    },

    async update(ids, patch) {
      if (!ids.length) return;
      const { error } = await db.from("ses_communications").update(patch).in("id", ids);
      if (error) throw error;
    },
  };
}
