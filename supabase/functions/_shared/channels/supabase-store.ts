// Channel data over Supabase, for the channel functions (service role: every
// query is scoped by the channel's hotel).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { supabaseToolStore } from "../tools/supabase-store.ts";
import type { CalendarStore } from "../tools/calendar.ts";
import type { ChannelInfo, ChannelStore } from "./inbound.ts";

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export interface OutboxRow {
  id: number;
  tenant_id: string;
  channel_id: string;
  payload: { from?: string; to?: string };
  attempts: number;
}

export function supabaseChannelStore(db: SupabaseClient) {
  const tools = supabaseToolStore(db);
  const store: ChannelStore &
    CalendarStore & {
      getChannel(id: string): Promise<ChannelInfo | null>;
      logMessage(m: {
        tenant_id: string;
        channel_id: string;
        direction: "in" | "out";
        event: string;
        external_ref?: string | null;
        reservation_id?: string | null;
        status: "ok" | "error";
        detail?: string | null;
        payload?: unknown;
      }): Promise<void>;
      pendingOutbox(tenantId: string | null, limit: number): Promise<OutboxRow[]>;
      markOutbox(ids: number[], status: "sent" | "error", error?: string | null): Promise<void>;
      reference(reservationId: string): Promise<string | null>;
    } = {
    getTenantSettings: tools.getTenantSettings,
    getBusyWindows: tools.getBusyWindows,
    findOrCreateCustomer: tools.findOrCreateCustomer,
    listRooms: tools.listRooms,
    getRate: tools.getRate,
    getActiveRules: tools.getActiveRules,
    countActiveRooms: tools.countActiveRooms,
    async getChannel(id) {
      const { data } = await db
        .from("channels")
        .select("id, tenant_id, kind, provider, name, status, commission_pct, room_map")
        .eq("id", id)
        .maybeSingle();
      return data
        ? ({ ...data, commission_pct: Number(data.commission_pct) } as ChannelInfo)
        : null;
    },
    async findChannelBooking(channelId, externalRef) {
      const { data } = await db
        .from("reservations")
        .select("id, status, room_id, start_at, end_at")
        .eq("channel_id", channelId)
        .eq("external_ref", externalRef)
        .maybeSingle();
      return data ?? null;
    },
    async insertChannelBooking(row) {
      return must(await db.from("reservations").insert(row).select("id").single()) as {
        id: string;
      };
    },
    async updateChannelBooking(id, patch) {
      must(await db.from("reservations").update(patch).eq("id", id).select("id"));
    },
    async logMessage(m) {
      must(await db.from("channel_messages").insert(m).select("id"));
      await db
        .from("channels")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", m.channel_id);
    },
    async pendingOutbox(tenantId, limit) {
      let q = db
        .from("channel_outbox")
        .select("id, tenant_id, channel_id, payload, attempts")
        .eq("status", "pending")
        .order("created_at")
        .limit(limit);
      if (tenantId) q = q.eq("tenant_id", tenantId);
      return must(await q) as OutboxRow[];
    },
    async markOutbox(ids, status, error = null) {
      if (!ids.length) return;
      must(
        await db
          .from("channel_outbox")
          .update({
            status,
            error,
            sent_at: status === "sent" ? new Date().toISOString() : null,
          })
          .in("id", ids)
          .select("id"),
      );
    },
    async reference(reservationId) {
      const { data } = await db
        .from("reservations")
        .select("reference")
        .eq("id", reservationId)
        .maybeSingle();
      return data?.reference ?? null;
    },
  };
  return store;
}
