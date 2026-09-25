// Server-side behaviour emulated in the browser for the backend-free demo: the
// RPCs and Edge Functions the app calls. Wherever possible it runs the same
// shared code as the real backend (e.g. createBookingDraft), so both modes
// behave alike. Only wired in when no Supabase credentials are configured.
import { isBlocking, type RoomReservation } from "@domain/availability.ts";
import { ymdInZone } from "@domain/dates.ts";
import { bookingReference } from "@domain/reference.ts";
import { tenantFeatures } from "@domain/features.ts";
import { reviewAuthor } from "@domain/reviews.ts";
import {
  BookingError,
  createBookingDraft,
  type BookingStore,
} from "../../../supabase/functions/_shared/tools/bookings.ts";
import { requestExtension } from "../../../supabase/functions/_shared/tools/extensions.ts";
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
  if (!r || typeof token !== "string" || !token) return null;
  const hash = await sha256Hex(token);
  if (r.access_token_hash && r.access_token_hash === hash) return r;
  // Tokens issued by a reference + email lookup (see find_guest_booking).
  const extra = (db().booking_access_tokens ?? []).some(
    (t) =>
      t.reservation_id === r.id && t.token_hash === hash && t.expires_at > new Date().toISOString(),
  );
  return extra ? r : null;
}

// Same as find_guest_booking: reference + email of a booking of the hotel.
async function findGuestBooking(args: Record<string, unknown>) {
  const ref = String(args.p_reference ?? "")
    .trim()
    .toUpperCase();
  const email = String(args.p_email ?? "")
    .trim()
    .toLowerCase();
  if (!ref || !email) return ok(null);
  const matches = db().reservations.filter((r) => {
    if (r.tenant_id !== args.p_tenant || r.status === "rejected") return false;
    if ((r.reference ?? bookingReference(String(r.id))) !== ref) return false;
    const guest =
      db().members.find((m) => m.id === r.member_id)?.email ??
      db().customers.find((c) => c.id === r.customer_id)?.email;
    return String(guest ?? "").toLowerCase() === email;
  });
  if (matches.length !== 1) return ok(null);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  db().booking_access_tokens ??= [];
  db().booking_access_tokens.push({
    id: uid("bat"),
    tenant_id: matches[0].tenant_id,
    reservation_id: matches[0].id,
    token_hash: await sha256Hex(token),
    expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });
  persist();
  return ok({ id: matches[0].id, token });
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

// Reviews: same rules and shapes as submit_review / reply_review / get_reviews.
const SCORE_KEYS = ["cleanliness", "staff", "location", "comfort", "value"];

function getReviews(args: Record<string, unknown>) {
  const rows = (db().reviews ?? [])
    .filter(
      (r) =>
        (args.p_property || args.p_tenant) &&
        (!args.p_property || r.property_id === args.p_property) &&
        (!args.p_tenant || r.tenant_id === args.p_tenant),
    )
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const avg = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;
  const distribution: Record<string, number> = {};
  for (const r of rows) distribution[r.rating] = (distribution[r.rating] ?? 0) + 1;
  const scores: Record<string, number | null> = {};
  for (const k of SCORE_KEYS) {
    const xs = rows.map((r) => r.scores?.[k]).filter((v): v is number => typeof v === "number");
    if (xs.length) scores[k] = avg(xs);
  }
  const limit = Math.min(Math.max(Number(args.p_limit ?? 20), 1), 100);
  return {
    count: rows.length,
    average: avg(rows.map((r) => Number(r.rating))),
    distribution,
    scores,
    reviews: rows.slice(0, limit).map((r) => ({
      id: r.id,
      property_id: r.property_id,
      rating: r.rating,
      scores: r.scores,
      comment: r.comment,
      author_name: r.author_name,
      created_at: r.created_at,
      reply: r.reply,
      replied_at: r.replied_at,
    })),
  };
}

async function submitReview(args: Record<string, unknown>) {
  const r = args.p_token
    ? await guestRow(args.p_reservation_id, args.p_token)
    : db().reservations.find((x) => x.id === args.p_reservation_id && x.member_id);
  if (!r) return fail("Reserva no encontrada");
  if (r.status !== "completed") return fail("Solo se puede valorar una estancia terminada");
  const tenant = db().tenants.find((t) => t.id === r.tenant_id);
  if (!tenantFeatures(tenant?.plan, tenant?.settings).reviews) {
    return fail("Este hotel no recoge valoraciones");
  }
  const rating = Number(args.p_rating);
  if (!(rating >= 1 && rating <= 5)) return fail("La nota va de 1 a 5");
  db().reviews ??= [];
  if (db().reviews.some((x) => x.reservation_id === r.id)) {
    return fail("Esta estancia ya tiene una valoración");
  }
  const raw = (args.p_scores ?? {}) as Record<string, unknown>;
  const scores = Object.fromEntries(
    Object.entries(raw).filter(
      ([k, v]) => SCORE_KEYS.includes(k) && typeof v === "number" && v >= 1 && v <= 5,
    ),
  );
  const name =
    db().members.find((m) => m.id === r.member_id)?.name ??
    db().customers.find((c) => c.id === r.customer_id)?.name;
  const id = uid("rev");
  db().reviews.push({
    id,
    tenant_id: r.tenant_id,
    reservation_id: r.id,
    property_id: r.property_id,
    rating,
    scores,
    comment:
      String(args.p_comment ?? "")
        .trim()
        .slice(0, 2000) || null,
    author_name: reviewAuthor(name),
    created_at: new Date().toISOString(),
    reply: null,
    replied_at: null,
    simulated: false,
  });
  persist();
  return ok(id);
}

// Chat with reception: same rules as get_stay_messages / send_stay_message.
async function guestStay(args: Record<string, unknown>) {
  return args.p_token
    ? await guestRow(args.p_reservation_id, args.p_token)
    : db().reservations.find((x) => x.id === args.p_reservation_id && x.member_id);
}

async function getStayMessages(args: Record<string, unknown>) {
  const r = await guestStay(args);
  if (!r) return fail("Reserva no encontrada");
  db().stay_messages ??= [];
  const now = new Date().toISOString();
  const thread = db().stay_messages.filter((m) => m.reservation_id === r.id);
  for (const m of thread) if (m.sender !== "guest" && !m.read_at) m.read_at = now;
  persist();
  return ok(
    thread
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .slice(-200)
      .map(({ id, sender, body, category, created_at, read_at }) => ({
        id,
        sender,
        body,
        category,
        created_at,
        read_at,
      })),
  );
}

async function sendStayMessage(args: Record<string, unknown>) {
  const r = await guestStay(args);
  if (!r) return fail("Reserva no encontrada");
  const recent = r.status === "completed" && Date.now() - Date.parse(r.end_at) < 3 * 86_400_000;
  if (!["pending", "confirmed", "in_progress"].includes(r.status) && !recent) {
    return fail("La conversación de esta reserva está cerrada");
  }
  const body = String(args.p_body ?? "")
    .trim()
    .slice(0, 2000);
  if (!body) return fail("Escribe un mensaje");
  db().stay_messages ??= [];
  const id = uid("msg");
  db().stay_messages.push({
    id,
    tenant_id: r.tenant_id,
    reservation_id: r.id,
    sender: "guest",
    body,
    category: (args.p_category as string | null) ?? null,
    staff_id: null,
    created_at: new Date().toISOString(),
    read_at: null,
  });
  persist();
  return ok(id);
}

// Folio (the stay's bill): same rules as get_folio, order_service,
// decide_extension, record_desk_payment and folio_balance.
function folioBalance(r: Row) {
  const charges = (db().folio_charges ?? [])
    .filter((c) => c.reservation_id === r.id && c.status === "posted")
    .reduce((sum, c) => sum + Number(c.amount), 0);
  return Math.round((Number(r.total) + charges - Number(r.paid_amount ?? 0)) * 100) / 100;
}

export function chargeRow(fields: Row): Row {
  const qty = Number(fields.qty ?? 1);
  const unit = Number(fields.unit_price);
  return {
    id: uid("chg"),
    created_at: new Date().toISOString(),
    posted_at: fields.status === "posted" ? new Date().toISOString() : null,
    void_reason: null,
    note: null,
    service_id: null,
    ...fields,
    qty,
    unit_price: unit,
    amount: Math.round(qty * unit * 100) / 100,
  };
}

async function getFolio(args: Record<string, unknown>) {
  const r = await guestStay(args);
  if (!r) return fail("Reserva no encontrada");
  const ext = (db().stay_extensions ?? [])
    .filter((x) => x.reservation_id === r.id)
    .sort((a, b) => String(b.requested_at).localeCompare(String(a.requested_at)))[0];
  return ok({
    reservation_id: r.id,
    status: r.status,
    booking_total: Number(r.total),
    paid: Number(r.paid_amount ?? 0),
    balance: folioBalance(r),
    charges: (db().folio_charges ?? [])
      .filter((c) => c.reservation_id === r.id && c.status !== "void")
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
    extension: ext
      ? {
          id: ext.id,
          new_check_out: ext.new_check_out,
          nights: ext.nights,
          amount: ext.amount,
          status: ext.status,
        }
      : null,
  });
}

async function orderService(args: Record<string, unknown>) {
  const r = await guestStay(args);
  if (!r) return fail("Reserva no encontrada");
  if (!["confirmed", "in_progress"].includes(r.status)) {
    return fail("Solo durante una estancia confirmada");
  }
  const svc = (db().stay_services ?? []).find(
    (x) => x.id === args.p_service_id && x.tenant_id === r.tenant_id && x.active !== false,
  );
  if (!svc) return fail("Servicio no disponible");
  const qty = Number(args.p_qty ?? 1);
  if (!(qty > 0 && qty <= 20)) return fail("Cantidad no válida");
  const note =
    String(args.p_note ?? "")
      .trim()
      .slice(0, 500) || null;
  db().folio_charges ??= [];
  const row = chargeRow({
    tenant_id: r.tenant_id,
    reservation_id: r.id,
    service_id: svc.id,
    category: svc.category,
    description: svc.name,
    qty,
    unit_price: svc.price,
    status: "requested",
    source: "guest",
    note,
  });
  db().folio_charges.push(row);
  db().stay_messages ??= [];
  db().stay_messages.push({
    id: uid("msg"),
    tenant_id: r.tenant_id,
    reservation_id: r.id,
    sender: "guest",
    body: `Pedido: ${qty} × ${svc.name}${note ? ` — ${note}` : ""}`,
    category:
      svc.category === "food" ? "room_service" : svc.category === "parking" ? "valet" : "other",
    created_at: new Date().toISOString(),
    read_at: null,
  });
  persist();
  return ok(row.id);
}

function decideExtension(args: Record<string, unknown>) {
  const x = (db().stay_extensions ?? []).find((e) => e.id === args.p_id);
  if (!x) return fail("Solicitud no encontrada");
  if (x.status !== "pending") return fail("La solicitud ya está resuelta");
  if (args.p_approve) {
    const r = db().reservations.find((e) => e.id === x.reservation_id);
    if (!r || !["confirmed", "in_progress"].includes(r.status)) {
      return fail("La reserva ya no se puede ampliar");
    }
    Object.assign(r, {
      end_at: x.new_end_at,
      base_price: Number(r.base_price) + Number(x.amount),
      total: Number(r.total) + Number(x.amount),
      updated_at: new Date().toISOString(),
    });
  }
  Object.assign(x, {
    status: args.p_approve ? "approved" : "rejected",
    decided_at: new Date().toISOString(),
    decision_note: (args.p_note as string) ?? null,
  });
  persist();
  return ok(null);
}

function recordDeskPayment(args: Record<string, unknown>) {
  const r = db().reservations.find((e) => e.id === args.p_reservation_id);
  if (!r) return fail("Reserva no encontrada");
  const amount = Number(args.p_amount);
  if (!(amount > 0) || amount > Math.max(folioBalance(r), 0)) {
    return fail("El importe debe estar entre 0 y el saldo pendiente");
  }
  r.paid_amount = Math.round((Number(r.paid_amount ?? 0) + amount) * 100) / 100;
  persist();
  return ok(null);
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
    case "find_guest_booking":
      return findGuestBooking(args);
    case "get_guest_booking":
      return getGuestBooking(args);
    case "report_stays":
      return ok(reportStays(args));
    case "get_stay_messages":
      return getStayMessages(args);
    case "send_stay_message":
      return sendStayMessage(args);
    case "get_folio":
      return getFolio(args);
    case "order_service":
      return orderService(args);
    case "decide_extension":
      return decideExtension(args);
    case "record_desk_payment":
      return recordDeskPayment(args);
    case "folio_balance": {
      const r = db().reservations.find((e) => e.id === args.p_reservation_id);
      return ok(r ? folioBalance(r) : null);
    }
    case "get_reviews":
      return ok(getReviews(args));
    case "get_my_review": {
      const r = args.p_token
        ? await guestRow(args.p_reservation_id, args.p_token)
        : db().reservations.find((x) => x.id === args.p_reservation_id && x.member_id);
      const review = r && (db().reviews ?? []).find((x) => x.reservation_id === r.id);
      return ok(review ?? null);
    }
    case "submit_review":
      return submitReview(args);
    case "reply_review": {
      const review = (db().reviews ?? []).find((x) => x.id === args.p_review_id);
      if (!review) return fail("Valoración no encontrada");
      const reply =
        String(args.p_reply ?? "")
          .trim()
          .slice(0, 2000) || null;
      Object.assign(review, { reply, replied_at: reply ? new Date().toISOString() : null });
      persist();
      return ok(null);
    }
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
  if (name === "stays-extend") {
    const r = await guestStay({ p_reservation_id: body.reservation_id, p_token: body.token });
    if (!r) return fail("Reserva no encontrada", "not_found");
    try {
      const result = await requestExtension(
        {
          ...mockBookingStore,
          async insertExtension(row) {
            db().stay_extensions ??= [];
            const pending = db().stay_extensions.some(
              (e) => e.reservation_id === row.reservation_id && e.status === "pending",
            );
            if (pending) return "already_pending";
            const id = uid("ext");
            db().stay_extensions.push({
              id,
              ...row,
              status: "pending",
              requested_at: new Date().toISOString(),
            });
            return { id };
          },
          async notify(tenantId, reservationId, text) {
            db().stay_messages ??= [];
            db().stay_messages.push({
              id: uid("msg"),
              tenant_id: tenantId,
              reservation_id: reservationId,
              sender: "guest",
              body: text,
              category: "other",
              created_at: new Date().toISOString(),
              read_at: null,
            });
          },
        },
        {
          id: r.id,
          tenant_id: r.tenant_id,
          room_id: r.room_id,
          status: r.status,
          end_at: r.end_at,
          people: Number(r.people ?? 2),
        },
        body,
      );
      persist();
      return ok(result);
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
    if (body.kind === "balance") {
      const balance = folioBalance(r);
      if (!(balance > 0)) return fail("Nothing to pay");
      r.paid_amount = Math.round((Number(r.paid_amount ?? 0) + balance) * 100) / 100;
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
