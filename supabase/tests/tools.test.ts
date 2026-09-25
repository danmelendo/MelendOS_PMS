// The agent/MCP tools over the real Supabase store (REST with the secret key,
// as the Edge Functions run them). Needs SUPABASE_URL, SUPABASE_SECRET_KEY and
// SUPABASE_PUBLISHABLE_KEY; skipped otherwise. Everything it creates is deleted
// at the end.
//
// Run: npm run test:db
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2"; // same module as the store (aliased in vitest.db.config)
import { referenceOf, runTool, type ToolContext } from "../functions/_shared/tools/registry.ts";
import { supabaseToolStore } from "../functions/_shared/tools/supabase-store.ts";

const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!SUPABASE_URL || !SUPABASE_SECRET_KEY || !SUPABASE_PUBLISHABLE_KEY)(
  "tools against Supabase",
  () => {
    let db: SupabaseClient;
    let ctx: ToolContext;
    const email = `tools-e2e-${Date.now()}@example.com`;
    const created: string[] = [];
    // Far enough ahead to be free, different from the other e2e scripts.
    const stay = { check_in: day(150), check_out: day(152) };

    const run = async (name: string, input: unknown, c = ctx) => {
      const res = await runTool(name, input, supabaseToolStore(db), c);
      if (!res.ok) throw new Error(`${name}: ${res.error.code} ${res.error.message}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
      return res.data as any;
    };

    beforeAll(async () => {
      db = createClient(SUPABASE_URL!, SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
      const { data: tenant } = await db
        .from("tenants")
        .select("id")
        .eq("slug", "hotel-lumen")
        .single();
      ctx = {
        tenantId: tenant!.id,
        userId: null,
        channel: "web_chat",
        webUrl: "https://lumen.demostays.example",
      };
    });

    afterAll(async () => {
      if (!created.length) return;
      await db.from("cancellation_requests").delete().in("reservation_id", created);
      await db.from("booking_journal").delete().in("booking_ref", created);
      await db.from("reservations").delete().in("id", created);
      await db.from("customers").delete().eq("email", email);
    });

    it("walks a guest from search to cancellation request", async () => {
      const found = await run("search_availability", { ...stay, guests: 2, limit: 3 });
      expect(found.results.length).toBeGreaterThan(0);
      expect(found.results.every((r: { hotel: string }) => r.hotel === "Hotel Lumen")).toBe(true);
      const pick = found.results[0];

      const details = await run("get_unit_details", { room_id: pick.room_id });
      expect(details.hotel).toBe("Hotel Lumen");

      const quote = await run("quote_price", { room_id: pick.room_id, ...stay, guests: 2 });
      expect(quote).toMatchObject({ available: true, total: pick.price_total });

      const draft = await run("create_booking_draft", {
        room_id: pick.room_id,
        ...stay,
        guests: 2,
        customer: { name: "Prueba Herramientas", email },
      });
      created.push(draft.reservation_id);
      expect(draft.reference).toBe(referenceOf(draft.reservation_id));

      const link = await run("create_payment_link", { reservation_id: draft.reservation_id });
      const token = new URL(link.payment_url).searchParams.get("t");
      // The rotated token opens the booking for the guest (anonymous RPC).
      const anon = createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
        auth: { persistSession: false },
      });
      const guest = await anon.rpc("get_guest_booking", {
        p_id: draft.reservation_id,
        p_token: token,
      });
      expect(guest.data?.status).toBe("pending");
      const oldToken = new URL(draft.manage_url).searchParams.get("t");
      const stale = await anon.rpc("get_guest_booking", {
        p_id: draft.reservation_id,
        p_token: oldToken,
      });
      expect(stale.data).toBeNull();

      const booking = await run("get_booking", { reference: draft.reference, email });
      expect(booking).toMatchObject({
        status: "pending",
        hotel: "Hotel Lumen",
        total: quote.total,
      });

      const request = await run("request_cancellation", { reference: draft.reference, email });
      expect(request.already_requested).toBe(false);
      const again = await run("request_cancellation", { reference: draft.reference, email });
      expect(again).toMatchObject({ already_requested: true, request_id: request.request_id });
    });

    it("keeps each hotel's bookings apart", async () => {
      const { data: albora } = await db
        .from("tenants")
        .select("id")
        .eq("slug", "albora-hotel-spa")
        .single();
      const other = { ...ctx, tenantId: albora!.id };
      const { data: lumenRoom } = await db
        .from("rooms")
        .select("id")
        .eq("tenant_id", ctx.tenantId)
        .limit(1)
        .single();
      const res = await runTool(
        "quote_price",
        { room_id: lumenRoom!.id, ...stay, guests: 2 },
        supabaseToolStore(db),
        other,
      );
      expect(res).toMatchObject({ ok: false, error: { code: "not_found" } });
      if (created[0]) {
        const b = await runTool(
          "create_payment_link",
          { reservation_id: created[0] },
          supabaseToolStore(db),
          other,
        );
        expect(b).toMatchObject({ ok: false, error: { code: "not_found" } });
      }
    });
  },
);
