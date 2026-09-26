// BookingStore over Supabase with the service-role client. Every query is
// scoped by tenant explicitly because service_role bypasses RLS.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { BookingStore } from "./bookings.ts";
import { hotelPolicies } from "../domain/policies.ts";
import type { BookingLookup, CatalogRoom, ToolStore } from "./registry.ts";
import type { ExtensionStore } from "./extensions.ts";

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
      const s = (t as unknown as { settings: Record<string, unknown> }).settings ?? {};
      return {
        checkin_hour: Number(s.checkin_hour ?? 15),
        checkout_hour: Number(s.checkout_hour ?? 12),
        timezone: String(s.timezone ?? "Europe/Madrid"),
        policies: hotelPolicies(s),
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

const BOOKING_COLUMNS =
  "id, tenant_id, reference, status, deposit_paid, is_prebooking, hold_expires_at, start_at, end_at, people, total, deposit_amount, payment_mode, free_cancellation_until, late_cancellation_fee, rooms(name), properties(name), customers(email), members(email)";

type BookingRow = Omit<BookingLookup, "room_name" | "property_name" | "guest_email"> & {
  rooms: { name: string } | null;
  properties: { name: string } | null;
  customers: { email: string | null } | null;
  members: { email: string } | null;
};

const toLookup = ({ rooms, properties, customers, members, ...r }: BookingRow): BookingLookup => ({
  ...r,
  total: Number(r.total),
  deposit_amount: Number(r.deposit_amount),
  room_name: rooms?.name ?? "",
  property_name: properties?.name ?? "",
  guest_email: members?.email ?? customers?.email ?? null,
});

/** ToolStore for the agent and MCP tools. Same rule: tenant on every query. */
export function supabaseToolStore(db: SupabaseClient): ToolStore {
  return {
    ...supabaseBookingStore(db),
    async listRooms(tenantId) {
      const rows = must(
        await db
          .from("rooms")
          .select(
            "id, tenant_id, property_id, name, asset_type, capacity, features, rate_group_id, status, active, properties(name), rate_groups(name)",
          )
          .eq("tenant_id", tenantId)
          .order("sort_order"),
      ) as unknown as (Omit<CatalogRoom, "category" | "property_name" | "rate_group_name"> & {
        asset_type: string;
        properties: { name: string } | null;
        rate_groups: { name: string } | null;
      })[];
      return rows.map(({ asset_type, properties, rate_groups, ...r }) => ({
        ...r,
        category: asset_type,
        property_name: properties?.name ?? "",
        rate_group_name: rate_groups?.name ?? null,
      }));
    },
    async findBookingByReference(tenantId, reference) {
      const rows = must(
        await db
          .from("reservations")
          .select(BOOKING_COLUMNS)
          .eq("tenant_id", tenantId)
          .eq("reference", reference)
          .limit(2),
      ) as unknown as BookingRow[];
      // A clash of 8-digit prefixes is astronomically rare; refuse to guess.
      return rows.length === 1 ? toLookup(rows[0]) : null;
    },
    async getBookingById(tenantId, id) {
      const row = must(
        await db
          .from("reservations")
          .select(BOOKING_COLUMNS)
          .eq("tenant_id", tenantId)
          .eq("id", id)
          .maybeSingle(),
      ) as unknown as BookingRow | null;
      return row ? toLookup(row) : null;
    },
    async createCancellationRequest(tenantId, reservationId, reason, channel, category) {
      const res = await db
        .from("cancellation_requests")
        .insert({
          tenant_id: tenantId,
          reservation_id: reservationId,
          reason,
          channel,
          category: category ?? null,
        })
        .select("id")
        .single();
      if (!res.error) return { id: res.data.id, created: true };
      // Unique index: one pending request per reservation.
      if (res.error.code !== "23505") throw new Error(res.error.message);
      const open = must(
        await db
          .from("cancellation_requests")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("reservation_id", reservationId)
          .eq("status", "pending")
          .single(),
      );
      return { id: (open as unknown as { id: string }).id, created: false };
    },
    async cancelBooking(tenantId, reservationId, channel, category) {
      const { data, error } = await db.rpc("cancel_booking_for_channel", {
        p_tenant: tenantId,
        p_reservation: reservationId,
        p_channel: channel,
        p_category: category,
      });
      if (error) throw new Error(error.message);
      return { refund: Number((data as { refund?: number } | null)?.refund ?? 0) };
    },
    async setAccessTokenHash(tenantId, reservationId, hash) {
      must(
        await db
          .from("reservations")
          .update({ access_token_hash: hash })
          .eq("tenant_id", tenantId)
          .eq("id", reservationId),
      );
    },
  };
}

/** Store for stay extensions: bookings plus the request and the chat notice. */
export function supabaseExtensionStore(db: SupabaseClient): ExtensionStore {
  return {
    ...supabaseBookingStore(db),
    async insertExtension(row) {
      const res = await db.from("stay_extensions").insert(row).select("id").single();
      if (res.error?.code === "23505") return "already_pending";
      if (res.error) throw new Error(res.error.message);
      return { id: (res.data as { id: string }).id };
    },
    async notify(tenantId, reservationId, body) {
      must(
        await db.from("stay_messages").insert({
          tenant_id: tenantId,
          reservation_id: reservationId,
          sender: "guest",
          body,
          category: "other",
        }),
      );
    },
  };
}
