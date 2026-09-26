// CopilotStore over Supabase. Built on the staff member's own session (not the
// service role), so row level security limits every read to their hotels on
// top of the tenant filter.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { parseStayFacts } from "../domain/kpis.ts";
import type { CopilotStore } from "./tools.ts";

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export function supabaseCopilotStore(db: SupabaseClient): CopilotStore {
  const count = async (
    q: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  ) => {
    const res = await q;
    if (res.error) throw new Error(res.error.message);
    return res.count ?? 0;
  };
  return {
    async stayFacts(tenantId, from, to) {
      const raw = must(
        await db.rpc("report_stays", { p_from: from, p_to: to, p_tenant: tenantId }),
      ) as Parameters<typeof parseStayFacts>[0];
      const parsed = parseStayFacts(raw ?? {});
      return { rooms: parsed.rooms[tenantId] ?? 0, facts: parsed.stays };
    },
    async rooms(tenantId) {
      const rows = must(
        await db
          .from("rooms")
          .select("id, name, asset_type, properties(name)")
          .eq("tenant_id", tenantId)
          .eq("active", true)
          .order("sort_order"),
      ) as unknown as {
        id: string;
        name: string;
        asset_type: string;
        properties: { name: string } | null;
      }[];
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        hotel: r.properties?.name ?? "",
        category: r.asset_type,
      }));
    },
    async guestMessages(tenantId, from, to) {
      return must(
        await db
          .from("stay_messages")
          .select("reservation_id, sender, category, created_at, read_at")
          .eq("tenant_id", tenantId)
          .gte("created_at", from)
          .lt("created_at", to)
          .order("created_at")
          .limit(5000),
      );
    },
    async requests(tenantId, from, to) {
      const [cancellations, extensions, charges] = await Promise.all([
        db
          .from("cancellation_requests")
          .select("status")
          .eq("tenant_id", tenantId)
          .gte("requested_at", from)
          .lt("requested_at", to),
        db
          .from("stay_extensions")
          .select("status")
          .eq("tenant_id", tenantId)
          .gte("requested_at", from)
          .lt("requested_at", to),
        db
          .from("folio_charges")
          .select("status")
          .eq("tenant_id", tenantId)
          .gte("created_at", from)
          .lt("created_at", to),
      ]);
      return {
        cancellations: must(cancellations),
        extensions: must(extensions),
        charges: must(charges),
      };
    },
    async reviews(tenantId, from, to) {
      return must(
        await db
          .from("reviews")
          .select("rating, scores, comment, reply, created_at")
          .eq("tenant_id", tenantId)
          .gte("created_at", from)
          .lt("created_at", to)
          .limit(2000),
      ) as {
        rating: number;
        scores: Record<string, number>;
        comment: string | null;
        reply: string | null;
        created_at: string;
      }[];
    },
    async pending(tenantId) {
      const head = { count: "exact" as const, head: true };
      const [cancellation_requests, extension_requests, service_orders, unread, unanswered] =
        await Promise.all([
          count(
            db
              .from("cancellation_requests")
              .select("id", head)
              .eq("tenant_id", tenantId)
              .eq("status", "pending"),
          ),
          count(
            db
              .from("stay_extensions")
              .select("id", head)
              .eq("tenant_id", tenantId)
              .eq("status", "pending"),
          ),
          count(
            db
              .from("folio_charges")
              .select("id", head)
              .eq("tenant_id", tenantId)
              .eq("status", "requested"),
          ),
          count(
            db
              .from("stay_messages")
              .select("id", head)
              .eq("tenant_id", tenantId)
              .eq("sender", "guest")
              .is("read_at", null),
          ),
          count(db.from("reviews").select("id", head).eq("tenant_id", tenantId).is("reply", null)),
        ]);
      return {
        cancellation_requests,
        extension_requests,
        service_orders,
        unread_guest_messages: unread,
        unanswered_reviews: unanswered,
      };
    },
  };
}
