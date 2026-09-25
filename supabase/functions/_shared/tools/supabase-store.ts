// BookingStore over Supabase with the service-role client. Every query is
// scoped by tenant explicitly because service_role bypasses RLS.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { BookingStore, TenantSettings } from "./bookings.ts";

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export function supabaseBookingStore(db: SupabaseClient): BookingStore {
  return {
    async getRoom(roomId) {
      const res = await db
        .from("rooms")
        .select("id, tenant_id, property_id, name, capacity, status, active, rate_group_id")
        .eq("id", roomId)
        .maybeSingle();
      return must(res);
    },
    async getTenantSettings(tenantId) {
      const t = must(await db.from("tenants").select("settings").eq("id", tenantId).single());
      const s = (t as { settings: Partial<TenantSettings> }).settings ?? {};
      return {
        checkin_hour: Number(s.checkin_hour ?? 15),
        checkout_hour: Number(s.checkout_hour ?? 12),
        deposit_pct: Number(s.deposit_pct ?? 30),
        timezone: String(s.timezone ?? "Europe/Madrid"),
      };
    },
    async getBusyWindows(tenantId, from, to) {
      return must(
        await db.rpc("room_busy_windows", {
          p_tenant: tenantId,
          p_from: from.toISOString(),
          p_to: to.toISOString(),
        }),
      ) as { room_id: string; start_at: string; end_at: string }[];
    },
    async countActiveRooms(tenantId) {
      const { count, error } = await db
        .from("rooms")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("active", true);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async getRate(rateGroupId) {
      return must(
        await db
          .from("rate_nightly")
          .select("price, weekend_price")
          .eq("rate_group_id", rateGroupId)
          .maybeSingle(),
      );
    },
    async getActiveRules(tenantId) {
      return must(
        await db
          .from("dynamic_rules")
          .select("name, type, multiplier, config")
          .eq("tenant_id", tenantId)
          .eq("active", true),
      );
    },
    async getActiveGifts(tenantId) {
      return must(
        await db
          .from("gift_thresholds")
          .select("min_extras_total, gift_extra_id")
          .eq("tenant_id", tenantId)
          .eq("active", true),
      );
    },
    async getExtras(tenantId, ids) {
      if (!ids.length) return [];
      return must(
        await db.from("extras").select("id, price, active").eq("tenant_id", tenantId).in("id", ids),
      );
    },
    async findMember(tenantId, userId) {
      return must(
        await db
          .from("members")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("user_id", userId)
          .maybeSingle(),
      );
    },
    async findOrCreateCustomer(tenantId, c) {
      return must(
        await db.rpc("find_or_create_customer", {
          p_tenant: tenantId,
          p_name: c.name,
          p_email: c.email,
          p_phone: c.phone ?? null,
        }),
      ) as string;
    },
    async insertReservation(r) {
      const res = await db.from("reservations").insert(r).select("id").single();
      if (res.error) {
        // The cleaning-gap trigger is the final guard against races.
        if (res.error.code === "23P01") throw new Error("La habitación acaba de ocuparse");
        throw new Error(res.error.message);
      }
      return res.data;
    },
    async insertExtras(tenantId, reservationId, rows) {
      must(
        await db
          .from("reservation_extras")
          .insert(rows.map((r) => ({ ...r, tenant_id: tenantId, reservation_id: reservationId }))),
      );
    },
  };
}
