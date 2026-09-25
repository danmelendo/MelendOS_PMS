// Server-side behaviour emulated in the browser for the backend-free demo: the
// RPCs and Edge Functions the app calls. Wherever possible it runs the same
// shared code as the real backend (e.g. createBookingDraft), so both modes
// behave alike. Only wired in when no Supabase credentials are configured.
import { isBlocking, type RoomReservation } from "@domain/availability.ts";
import { ymdInZone } from "@domain/dates.ts";
import {
  BookingError,
  createBookingDraft,
  type BookingStore,
} from "../../../supabase/functions/_shared/tools/bookings.ts";
import { DEMO_MEMBER_ID, type Row } from "./seed";
import { db, persist, uid } from "./mock-db";

type Result = { data: unknown; error: { message: string; code?: string } | null };
const ok = (data: unknown): Result => ({ data, error: null });
const fail = (message: string, code?: string): Result => ({ data: null, error: { message, code } });

const sameTenant = (row: Row, tenantId: string) => !row.tenant_id || row.tenant_id === tenantId;

async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toRoomReservation(r: Row): RoomReservation {
  return {
    id: String(r.id),
    roomId: String(r.room_id),
    status: r.status,
    startAt: String(r.start_at),
    endAt: String(r.end_at),
    cleaningMinutes: Number(r.cleaning_minutes ?? 15),
    createdAt: String(r.created_at ?? new Date().toISOString()),
    manualOverride: !!r.manual_override,
  };
}

function holdActive(r: Row, now: Date) {
  return r.is_prebooking && r.hold_expires_at && new Date(r.hold_expires_at) > now;
}

// ── room_busy_windows ────────────────────────────────────────────────────────
function busyWindows(tenantId: string, from: Date, to: Date) {
  const now = new Date();
  const rooms = new Set(
    db()
      .rooms.filter((r) => sameTenant(r, tenantId))
      .map((r) => r.id),
  );
  return db()
    .reservations.filter((r) => rooms.has(r.room_id))
    .filter((r) => isBlocking(toRoomReservation(r), now) || holdActive(r, now))
    .filter((r) => new Date(r.start_at) < to && new Date(r.end_at) > from)
    .map((r) => ({
      room_id: r.room_id,
      start_at: r.start_at,
      end_at: new Date(
        new Date(r.end_at).getTime() + Number(r.cleaning_minutes ?? 15) * 60_000,
      ).toISOString(),
    }));
}

// ── Booking store over the in-memory dataset ─────────────────────────────────
const mockBookingStore: BookingStore = {
  async getRoom(id) {
    const r = db().rooms.find((x) => x.id === id);
    return r
      ? {
          id: r.id,
          tenant_id: r.tenant_id,
          property_id: r.property_id,
          name: r.name,
          capacity: Number(r.capacity),
          status: r.status,
          active: !!r.active,
          rate_group_id: r.rate_group_id,
        }
      : null;
  },
  async getTenantSettings(tenantId) {
    const t = db().tenants.find((x) => x.id === tenantId);
    return {
      checkin_hour: 15,
      checkout_hour: 12,
      deposit_pct: 30,
      timezone: "Europe/Madrid",
      ...(t?.settings ?? {}),
    };
  },
  async getBusyWindows(tenantId, from, to) {
    return busyWindows(tenantId, from, to);
  },
  async countActiveRooms(tenantId) {
    return db().rooms.filter((r) => sameTenant(r, tenantId) && r.active).length;
  },
  async getRate(rateGroupId) {
    return (db().rate_nightly.find((r) => r.rate_group_id === rateGroupId) ?? null) as {
      price: number;
      weekend_price: number | null;
    } | null;
  },
  async getActiveRules(tenantId) {
    return db().dynamic_rules.filter((r) => r.active && sameTenant(r, tenantId)) as {
      name: string;
      type: string;
      multiplier: number;
      config: Record<string, unknown>;
    }[];
  },
  async getActiveGifts(tenantId) {
    return db().gift_thresholds.filter((g) => g.active && sameTenant(g, tenantId)) as {
      min_extras_total: number;
      gift_extra_id: string;
    }[];
  },
  async getExtras(tenantId, ids) {
    return db().extras.filter((e) => ids.includes(e.id) && sameTenant(e, tenantId)) as {
      id: string;
      price: number;
      active: boolean;
    }[];
  },
  async findMember(_tenantId, userId) {
    // In the demo the signed-in guest is always the seeded member.
    return userId ? { id: DEMO_MEMBER_ID } : null;
  },
  async findOrCreateCustomer(tenantId, c) {
    const email = c.email.toLowerCase();
    const existing = db().customers.find(
      (x) => sameTenant(x, tenantId) && String(x.email ?? "").toLowerCase() === email,
    );
    if (existing) return existing.id;
    const row = {
      id: uid("cust"),
      tenant_id: tenantId,
      name: c.name,
      email: c.email,
      phone: c.phone ?? null,
      no_contact: false,
      notes: null,
      created_at: new Date().toISOString(),
    };
    db().customers.push(row);
    return row.id;
  },
  async insertReservation(r) {
    const now = new Date().toISOString();
    const row = {
      id: uid("res"),
      ...r,
      cleaning_minutes: 15,
      paid_amount: 0,
      deposit_paid: false,
      manual_override: false,
      internal_notes: null,
      created_by: null,
      redsys_order: null,
      created_at: now,
      updated_at: now,
    };
    db().reservations.push(row);
    return { id: row.id };
  },
  async insertExtras(tenantId, reservationId, rows) {
    for (const x of rows) {
      db().reservation_extras.push({
        id: uid("rx"),
        tenant_id: tenantId,
        reservation_id: reservationId,
        ...x,
        created_at: new Date().toISOString(),
      });
    }
  },
};

// ── Guest access by token ────────────────────────────────────────────────────
async function guestRow(id: unknown, token: unknown): Promise<Row | null> {
  const r = db().reservations.find((x) => x.id === id);
  if (!r || !r.access_token_hash || typeof token !== "string" || !token) return null;
  return r.access_token_hash === (await sha256Hex(token)) ? r : null;
}

function journalFor(ref: string) {
  return db()
    .booking_journal.filter((j) => j.booking_ref === ref)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

async function getGuestBooking(args: Record<string, unknown>) {
  const r = await guestRow(args.p_id, args.p_token);
  if (!r) return ok(null);
  const room = db().rooms.find((x) => x.id === r.room_id);
  const property = db().properties.find((x) => x.id === r.property_id);
  const signature = db()
    .signatures.filter((s) => s.reservation_id === r.id)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  return ok({
    ...r,
    access_token_hash: undefined,
    room_name: room?.name ?? null,
    property_name: property?.name ?? null,
    signature: signature ?? null,
    journal: journalFor(String(r.id)),
  });
}

// Stay facts for the dashboards: same projection as the report_stays SQL
// function (dates in the hotel timezone), fed to the shared KPI code.
function reportStays(args: Record<string, unknown>) {
  const from = String(args.p_from);
  const to = String(args.p_to);
  const tenants = db().tenants.filter((t) => !args.p_tenant || t.id === args.p_tenant);
  const rooms: Record<string, number> = {};
  const stays: unknown[][] = [];
  for (const t of tenants) {
    const tz = String(t.settings?.timezone ?? "Europe/Madrid");
    rooms[t.id] = db().rooms.filter((r) => r.tenant_id === t.id && r.active !== false).length;
    for (const r of db().reservations) {
      if (r.tenant_id !== t.id) continue;
      const checkIn = ymdInZone(String(r.start_at), tz);
      const checkOut = ymdInZone(String(r.end_at), tz);
      const created = ymdInZone(String(r.created_at ?? r.start_at), tz);
      const cancelledAt = r.cancelled_at ?? (r.status === "cancelled" ? r.updated_at : null);
      const overlaps = checkIn <= to && checkOut > from;
      if (!overlaps && (created < from || created > to)) continue;
      stays.push([
        t.id,
        r.room_id,
        checkIn,
        checkOut,
        created,
        cancelledAt ? ymdInZone(String(cancelledAt), tz) : null,
        r.status,
        r.created_by_role ?? null,
        Number(r.people ?? 2),
        Number(r.base_price ?? 0) +
          Number(r.dynamic_surcharge ?? 0) -
          Number(r.discount_amount ?? 0),
      ]);
    }
  }
  return { rooms, stays };
}

// ── RPC ──────────────────────────────────────────────────────────────────────
export async function mockServerRpc(
  fn: string,
  args: Record<string, unknown>,
): Promise<Result | undefined> {
  switch (fn) {
    case "room_busy_windows":
      return ok(
        busyWindows(
          String(args.p_tenant),
          new Date(String(args.p_from)),
          new Date(String(args.p_to)),
        ),
      );
    case "get_guest_booking":
      return getGuestBooking(args);
    case "report_stays":
      return ok(reportStays(args));
    case "sign_guest_registration": {
      const r = await guestRow(args.p_id, args.p_token);
      if (!r) return fail("Reserva no encontrada");
      const now = new Date().toISOString();
      db().signatures.push({
        id: uid("sig"),
        tenant_id: r.tenant_id,
        reservation_id: r.id,
        doc_type: "guest_registration",
        signer_name: String(args.p_signer),
        signature_data: args.p_signature_data,
        status: "signed",
        signed_at: now,
        created_at: now,
      });
      persist();
      return ok(null);
    }
    case "cancel_guest_booking":
    case "cancel_my_reservation": {
      const r =
        fn === "cancel_guest_booking"
          ? await guestRow(args.p_id, args.p_token)
          : db().reservations.find((x) => x.id === args.p_reservation_id && x.member_id);
      if (!r) return fail("Reserva no encontrada");
      if (r.status !== "pending" || r.deposit_paid) {
        return fail("Esta reserva solo la puede cancelar el hotel");
      }
      r.status = "cancelled";
      r.cancellation_reason = "Cancelada por el huésped";
      persist();
      return ok(null);
    }
    case "decide_cancellation": {
      const req = db().cancellation_requests?.find((x) => x.id === args.p_request_id);
      if (!req) return fail("Solicitud no encontrada");
      if (req.status !== "pending") return fail("La solicitud ya está resuelta");
      const approve = !!args.p_approve;
      Object.assign(req, {
        status: approve ? "approved" : "rejected",
        decided_at: new Date().toISOString(),
        decided_by: "demo-staff",
        decision_note: (args.p_note as string | null) ?? null,
      });
      const r = db().reservations.find((x) => x.id === req.reservation_id);
      if (approve && r && ["pending", "confirmed"].includes(String(r.status))) {
        r.status = "cancelled";
        r.cancellation_reason =
          String(req.reason ?? "").trim() || "Cancelada a petición del huésped";
      }
      persist();
      return ok(null);
    }
    case "redeem_reward": {
      const reward = db().rewards.find((x) => x.id === args.p_reward_id && x.active);
      const acc = db().loyalty_accounts.find((x) => x.member_id === args.p_member_id);
      if (!reward || !acc) return fail("Recompensa no encontrada");
      if (Number(acc.points) < Number(reward.cost_points)) return fail("Puntos insuficientes");
      acc.points = Number(acc.points) - Number(reward.cost_points);
      db().loyalty_transactions.push({
        id: uid("lt"),
        tenant_id: acc.tenant_id,
        member_id: acc.member_id,
        type: "redeem",
        points: -Number(reward.cost_points),
        reason: `Canje · ${reward.name}`,
        reservation_id: null,
        created_at: new Date().toISOString(),
      });
      persist();
      return ok(acc.points);
    }
    default:
      return undefined; // not handled here
  }
}

// ── Edge Functions ───────────────────────────────────────────────────────────
export async function mockServerFunction(
  name: string,
  body: Record<string, unknown>,
  signedIn: boolean,
): Promise<Result | undefined> {
  if (name === "bookings-create") {
    try {
      const draft = await createBookingDraft(mockBookingStore, body, {
        userId: signedIn ? "demo-guest" : null,
        channel: signedIn ? "member" : "public",
      });
      persist();
      return ok(draft);
    } catch (e) {
      if (e instanceof BookingError) return fail(e.message, e.code);
      throw e;
    }
  }
  if (name === "payments-create") {
    // No real gateway in the demo: the "provider" approves at once and the
    // browser is sent straight back to the return URL.
    const r = db().reservations.find((x) => x.id === body.reservation_id);
    if (!r) return fail("Reservation not found");
    if (r.status !== "pending" || r.deposit_paid)
      return fail("This reservation is not awaiting payment");
    const order = `DEMO-${Date.now().toString(36)}`;
    r.deposit_paid = true;
    r.status = "confirmed";
    r.is_prebooking = false;
    r.hold_expires_at = null;
    r.redsys_order = order;
    r.paid_amount = Number(r.deposit_amount ?? 0);
    r.updated_at = new Date().toISOString();
    persist();
    const back = new URL(String(body.return_url), window.location.origin);
    back.searchParams.set("payment", "ok");
    back.searchParams.set("reservation", String(r.id));
    return ok({
      payment_id: uid("pay"),
      provider: "demo",
      redirect: { kind: "url", url: back.toString() },
    });
  }
  return undefined;
}
