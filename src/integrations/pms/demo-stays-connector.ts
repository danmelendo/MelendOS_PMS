// ─────────────────────────────────────────────────────────────────────────────
// DemoStaysConnector — reference PMS connector
//
// Implements PmsConnector on top of the existing Demo Stays backend (the
// Supabase-shaped in-browser mock + the real pricing engine). Every method maps
// PMS rows ↔ integration DTOs and records booking-lifecycle events in the shared
// `booking_journal`, so the reception panel and the mobile app see one history.
//
// To integrate another PMS, write an equivalent class against its API and swap
// the singleton exported from ./index.ts — the mobile UI is unaffected.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { calculateNightlyPrice } from "@/lib/pricing";
import { CHECKIN_HOUR, CHECKOUT_HOUR } from "@/lib/data";
import type {
  BookSpaceInput,
  CreateIncidentInput,
  CreatePrebookingInput,
  CreateWatchInput,
  PmsConnector,
} from "./connector";
import type {
  AvailabilityQuery,
  AvailabilityWatch,
  BookingStatus,
  CommonSpace,
  Incident,
  Invoice,
  JournalEntry,
  JournalEventType,
  LoyaltyAccount,
  LoyaltyTier,
  LoyaltyTransaction,
  Member,
  OccupancyBand,
  Prebooking,
  PmsProperty,
  PmsProvince,
  PmsRoom,
  PricePreview,
  PropertyBrand,
  Reservation,
  Reward,
  RoomOffer,
  SignatureDoc,
  SignatureDocType,
  SpaceBooking,
} from "./types";

// Untyped marshalling boundary (see below); rows are mapped to typed DTOs here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// The in-browser mock is schema-less at runtime; the generated `Database` types
// only describe the original PMS tables. This connector also reads/writes the
// mobile + loyalty tables (properties, members, loyalty_*, signatures,
// booking_journal) and a few extra reservation columns, so it speaks to the
// client through a permissive handle — the same untyped marshalling boundary a
// real PMS connector has against an external HTTP API.
const sb = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  functions: typeof supabase.functions;
};

const HOLD_MINUTES = 30;

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(`${checkIn}T00:00:00`).getTime();
  const b = new Date(`${checkOut}T00:00:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function startIso(checkIn: string) {
  return `${checkIn}T${String(CHECKIN_HOUR).padStart(2, "0")}:00:00`;
}
function endIso(checkOut: string) {
  return `${checkOut}T${String(CHECKOUT_HOUR).padStart(2, "0")}:00:00`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// Occupancy → dynamic surcharge band. Fewer free rooms over the window ⇒ higher
// price. Thresholds chosen so the band changes visibly at demo room counts.
function occupancyBand(ratio: number): { band: OccupancyBand; surchargePct: number } {
  if (ratio >= 60) return { band: "high", surchargePct: 20 };
  if (ratio >= 25) return { band: "medium", surchargePct: 10 };
  return { band: "low", surchargePct: 0 };
}

export class DemoStaysConnector implements PmsConnector {
  readonly pmsName = "Demo Stays PMS";

  // ── helpers ────────────────────────────────────────────────────────────────

  private async appendJournal(
    bookingRef: string,
    eventType: JournalEventType,
    opts: {
      memberId?: string | null;
      propertyId?: string | null;
      actor?: string;
      payload?: Row;
    } = {},
  ) {
    await sb.from("booking_journal").insert({
      id: uid("jr"),
      booking_ref: bookingRef,
      member_id: opts.memberId ?? null,
      property_id: opts.propertyId ?? null,
      event_type: eventType,
      actor: opts.actor ?? "member",
      payload: opts.payload ?? {},
      created_at: new Date().toISOString(),
    });
  }

  /** Expired holds are released so they stop blocking their slot. */
  private async sweepExpiredHolds() {
    const nowIso = new Date().toISOString();
    const { data } = await sb
      .from("reservations")
      .select("id,hold_expires_at,is_prebooking,status")
      .eq("is_prebooking", true)
      .eq("status", "pending");
    for (const r of (data ?? []) as Row[]) {
      if (r.hold_expires_at && r.hold_expires_at < nowIso) {
        await sb
          .from("reservations")
          .update({ status: "cancelled", internal_notes: "Prereserva expirada" })
          .eq("id", r.id);
      }
    }
  }

  private async nightlyFromPriceByGroup(): Promise<Map<string, number>> {
    const { data } = await sb.from("rate_nightly").select("rate_group_id,price");
    const map = new Map<string, number>();
    for (const r of (data ?? []) as Row[]) map.set(r.rate_group_id, Number(r.price));
    return map;
  }

  private mapRoom(r: Row): PmsRoom {
    return {
      id: r.id,
      propertyId: r.property_id,
      name: r.name,
      assetType: r.asset_type ?? "room",
      features: Array.isArray(r.features) ? r.features : [],
      capacity: Number(r.capacity ?? 2),
      rateGroupId: r.rate_group_id ?? null,
      imageUrl: r.image_url ?? null,
    };
  }

  private bookingStatus(r: Row): BookingStatus {
    if (r.status === "cancelled") {
      return r.internal_notes === "Prereserva expirada" ? "expired" : "cancelled";
    }
    if (r.status === "pending") {
      if (r.hold_expires_at && r.hold_expires_at < new Date().toISOString()) return "expired";
      return "held";
    }
    if (r.status === "confirmed") return "confirmed";
    if (r.status === "in_progress") return "in_progress";
    if (r.status === "completed") return "completed";
    return "held";
  }

  private async mapBooking(r: Row): Promise<Prebooking> {
    const [{ data: room }, { data: property }] = await Promise.all([
      sb.from("rooms").select("name,property_id").eq("id", r.room_id).maybeSingle(),
      r.property_id
        ? sb.from("properties").select("name").eq("id", r.property_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const checkIn = String(r.start_at).slice(0, 10);
    const checkOut = String(r.end_at).slice(0, 10);
    return {
      id: r.id,
      memberId: r.member_id,
      propertyId: r.property_id ?? (room as Row)?.property_id ?? "",
      propertyName: (property as Row)?.name ?? "Demo Stays",
      roomId: r.room_id,
      roomName: (room as Row)?.name ? `Habitación ${(room as Row).name}` : "Habitación",
      checkIn,
      checkOut,
      nights: nightsBetween(checkIn, checkOut),
      guests: Number(r.people ?? 2),
      total: Number(r.total ?? 0),
      deposit: Number(r.deposit_amount ?? 0),
      status: this.bookingStatus(r),
      holdExpiresAt: r.hold_expires_at ?? null,
      isPrebooking: !!r.is_prebooking,
      createdAt: r.created_at,
    };
  }

  // ── Discovery ────────────────────────────────────────────────────────────────

  async listProvinces(filter?: { brand?: PropertyBrand }): Promise<PmsProvince[]> {
    let pq = sb.from("properties").select("province_id,brand").eq("active", true);
    if (filter?.brand) pq = pq.eq("brand", filter.brand);
    const [{ data: provinces }, { data: properties }] = await Promise.all([
      sb.from("provinces").select("*").order("sort_order"),
      pq,
    ]);
    const counts = new Map<string, number>();
    for (const p of (properties ?? []) as Row[])
      counts.set(p.province_id, (counts.get(p.province_id) ?? 0) + 1);
    // Only surface provinces that actually have properties for the active brand.
    return ((provinces ?? []) as Row[])
      .filter((p) => counts.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        accent: p.accent,
        tagline: p.tagline,
        propertyCount: counts.get(p.id) ?? 0,
      }));
  }

  async listProperties(filter?: {
    provinceId?: string;
    brand?: PropertyBrand;
  }): Promise<PmsProperty[]> {
    let q = sb.from("properties").select("*").eq("active", true).order("sort_order");
    if (filter?.provinceId) q = q.eq("province_id", filter.provinceId);
    if (filter?.brand) q = q.eq("brand", filter.brand);
    const [{ data: properties }, { data: provinces }, { data: rooms }, fromByGroup] =
      await Promise.all([
        q,
        sb.from("provinces").select("id,name,accent"),
        sb.from("rooms").select("property_id,rate_group_id").eq("active", true),
        this.nightlyFromPriceByGroup(),
      ]);
    const provById = new Map(((provinces ?? []) as Row[]).map((p) => [p.id, p]));
    // cheapest nightly price per property
    const fromByProperty = new Map<string, number>();
    for (const r of (rooms ?? []) as Row[]) {
      const price = fromByGroup.get(r.rate_group_id);
      if (price == null) continue;
      const cur = fromByProperty.get(r.property_id);
      if (cur == null || price < cur) fromByProperty.set(r.property_id, price);
    }
    return ((properties ?? []) as Row[]).map((p) => {
      const prov = provById.get(p.province_id) as Row | undefined;
      const fromPrice = fromByProperty.get(p.id) ?? null;
      return {
        id: p.id,
        name: p.name,
        brand: (p.brand ?? "urban") as PropertyBrand,
        provinceId: p.province_id,
        provinceName: prov?.name ?? "",
        city: p.city,
        address: p.address,
        rating: Number(p.rating ?? 0),
        amenities: p.amenities ?? [],
        description: p.description ?? "",
        accent: prov?.accent ?? "256 70% 60%",
        fromPrice,
      };
    });
  }

  async getProperty(id: string): Promise<PmsProperty | null> {
    const all = await this.listProperties();
    return all.find((p) => p.id === id) ?? null;
  }

  async listRooms(propertyId: string): Promise<PmsRoom[]> {
    const { data } = await sb
      .from("rooms")
      .select("*")
      .eq("property_id", propertyId)
      .eq("active", true)
      .order("sort_order");
    return ((data ?? []) as Row[]).map((r) => this.mapRoom(r));
  }

  // ── Availability ───────────────────────────────────────────────────────────

  async searchAvailability(query: AvailabilityQuery): Promise<RoomOffer[]> {
    return (await this.computeAvailability(query)).offers;
  }

  /** Occupancy-aware price preview: resolves the catalogue's indeterminate
   *  ranges into a concrete "for your dates" price for the cheapest free room. */
  async getPricePreview(query: AvailabilityQuery): Promise<PricePreview> {
    const a = await this.computeAvailability(query);
    const free = a.offers.filter((o) => o.available);
    const cheapest = free.reduce<RoomOffer | null>(
      (min, o) => (!min || o.pricePerNight < min.pricePerNight ? o : min),
      null,
    );
    return {
      available: free.length,
      totalRooms: a.totalRooms,
      occupancyPct: a.occupancyPct,
      band: a.band,
      surchargePct: a.surchargePct,
      nights: a.nights,
      fromNight: cheapest ? cheapest.pricePerNight : null,
      fromTotal: cheapest ? cheapest.price : null,
    };
  }

  /** Shared availability + occupancy pricing used by both methods above, so the
   *  preview and the bookable offers always agree on the price. */
  private async computeAvailability(query: AvailabilityQuery): Promise<{
    offers: RoomOffer[];
    occupancyPct: number;
    surchargePct: number;
    band: OccupancyBand;
    totalRooms: number;
    nights: number;
  }> {
    await this.sweepExpiredHolds();
    const nights = nightsBetween(query.checkIn, query.checkOut);
    const rooms = await this.listRooms(query.propertyId);
    const start = startIso(query.checkIn);
    const end = endIso(query.checkOut);
    // Reservations that could block any of these rooms in the window.
    const roomIds = rooms.map((r) => r.id);
    const { data: blockers } = await sb
      .from("reservations")
      .select("room_id,status,start_at,end_at,is_prebooking,hold_expires_at")
      .in("room_id", roomIds.length ? roomIds : ["__none__"]);
    const nowIso = new Date().toISOString();
    const blockedRooms = new Set<string>();
    for (const b of (blockers ?? []) as Row[]) {
      if (b.status === "cancelled" || b.status === "no_show" || b.status === "rejected") continue;
      if (
        b.status === "pending" &&
        b.is_prebooking &&
        b.hold_expires_at &&
        b.hold_expires_at < nowIso
      )
        continue;
      if (String(b.start_at) < end && start < String(b.end_at)) blockedRooms.add(b.room_id);
    }

    // Dynamic pricing: the fuller the property over the window, the higher the
    // price. Same surcharge applied to the bookable offer and the preview.
    const totalRooms = rooms.length || 1;
    const occupancyPct = Math.round((blockedRooms.size / totalRooms) * 100);
    const { band, surchargePct } = occupancyBand(occupancyPct);
    const mult = 1 + surchargePct / 100;

    const offers: RoomOffer[] = [];
    for (const room of rooms) {
      let price = 0;
      if (room.rateGroupId && nights > 0) {
        const breakdown = await calculateNightlyPrice({
          rateGroupId: room.rateGroupId,
          checkIn: new Date(start),
          checkOut: new Date(end),
          extras: [],
        });
        price = breakdown.total;
      }
      offers.push({
        room,
        available: !blockedRooms.has(room.id) && room.capacity >= query.guests,
        nights,
        price: round2(price * mult),
        pricePerNight: nights > 0 ? round2((price / nights) * mult) : 0,
      });
    }
    return { offers, occupancyPct, surchargePct, band, totalRooms, nights };
  }

  // ── Prebookings & reservations ─────────────────────────────────────────────

  async createPrebooking(input: CreatePrebookingInput): Promise<Prebooking> {
    await this.sweepExpiredHolds();
    const { data: room } = await sb.from("rooms").select("*").eq("id", input.roomId).maybeSingle();
    if (!room) throw new Error("Habitación no encontrada");
    const r = room as Row;

    const start = startIso(input.checkIn);
    const end = endIso(input.checkOut);
    const breakdown = await calculateNightlyPrice({
      rateGroupId: r.rate_group_id,
      checkIn: new Date(start),
      checkOut: new Date(end),
      extras: [],
    });
    const total = breakdown.total;
    const deposit = round2(total * 0.3);
    const holdExpiresAt = input.hold
      ? new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString()
      : null;

    const { data: inserted, error } = await sb
      .from("reservations")
      .insert({
        room_id: input.roomId,
        property_id: r.property_id,
        member_id: input.memberId,
        customer_id: null,
        start_at: start,
        end_at: end,
        people: input.guests,
        cleaning_minutes: 15,
        base_price: breakdown.base,
        dynamic_surcharge: breakdown.dynamicSurcharge,
        dynamic_reason: breakdown.dynamicReason,
        extras_total: 0,
        total,
        deposit_amount: deposit,
        deposit_paid: false,
        paid_amount: 0,
        status: "pending",
        is_prebooking: input.hold,
        hold_expires_at: holdExpiresAt,
        manual_override: false,
        created_by_role: "member",
        internal_notes: null,
      })
      .select("*")
      .single();
    if (error) throw new Error((error as Row).message ?? "No se pudo crear la prereserva");

    const row = inserted as Row;
    await this.appendJournal(row.id, "prebooked", {
      memberId: input.memberId,
      propertyId: r.property_id,
      payload: { room: r.name, checkIn: input.checkIn, checkOut: input.checkOut, hold: input.hold },
    });
    return this.mapBooking(row);
  }

  async getPrebooking(id: string): Promise<Prebooking | null> {
    return this.getBooking(id);
  }

  async getBooking(id: string): Promise<Prebooking | null> {
    await this.sweepExpiredHolds();
    const { data } = await sb.from("reservations").select("*").eq("id", id).maybeSingle();
    if (!data) return null;
    return this.mapBooking(data as Row);
  }

  async confirmPrebooking(id: string): Promise<Reservation> {
    const { data: existing } = await sb.from("reservations").select("*").eq("id", id).maybeSingle();
    if (!existing) throw new Error("Reserva no encontrada");
    const row = existing as Row;

    // Reuse the PMS payment path (mock marks deposit paid + status confirmed).
    const { error } = await supabase.functions.invoke("create-redsys-payment", {
      body: { reservation_id: id },
    });
    if (error) throw new Error("No se pudo procesar la señal");

    await sb
      .from("reservations")
      .update({ is_prebooking: false, hold_expires_at: null })
      .eq("id", id);

    await this.appendJournal(id, "confirmed", {
      memberId: row.member_id,
      propertyId: row.property_id,
      payload: { deposit: Number(row.deposit_amount ?? 0) },
    });

    // Earn loyalty points based on the member's current tier multiplier.
    if (row.member_id) {
      await this.earnPoints(row.member_id, Number(row.total ?? 0), id, row.property_id);
    }

    const updated = await this.getBooking(id);
    return updated!;
  }

  async cancelPrebooking(id: string): Promise<void> {
    const { data } = await sb.from("reservations").select("*").eq("id", id).maybeSingle();
    const row = data as Row | null;
    await sb.from("reservations").update({ status: "cancelled" }).eq("id", id);
    if (row) {
      await this.appendJournal(id, "cancelled", {
        memberId: row.member_id,
        propertyId: row.property_id,
      });
    }
  }

  async listBookings(memberId: string): Promise<Prebooking[]> {
    await this.sweepExpiredHolds();
    const { data } = await sb
      .from("reservations")
      .select("*")
      .eq("member_id", memberId)
      .order("start_at", { ascending: false });
    const rows = (data ?? []) as Row[];
    return Promise.all(rows.map((r) => this.mapBooking(r)));
  }

  // ── Loyalty club ───────────────────────────────────────────────────────────

  private async getTiers(): Promise<LoyaltyTier[]> {
    const { data } = await sb.from("loyalty_tiers").select("*").order("min_points");
    return ((data ?? []) as Row[]).map((t) => ({
      id: t.id,
      name: t.name,
      minPoints: Number(t.min_points),
      pointsPerEuro: Number(t.points_per_euro),
      perks: t.perks ?? [],
    }));
  }

  async getMember(memberId: string): Promise<Member | null> {
    const { data } = await sb.from("members").select("*").eq("id", memberId).maybeSingle();
    if (!data) return null;
    const m = data as Row;
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      phone: m.phone ?? null,
      memberNumber: m.member_number,
    };
  }

  async getLoyaltyAccount(memberId: string): Promise<LoyaltyAccount> {
    const [{ data: acct }, tiers, { data: member }] = await Promise.all([
      sb.from("loyalty_accounts").select("*").eq("member_id", memberId).maybeSingle(),
      this.getTiers(),
      sb.from("members").select("member_number").eq("id", memberId).maybeSingle(),
    ]);
    const a = (acct as Row) ?? {
      points: 0,
      lifetime_points: 0,
      member_since: new Date().toISOString(),
    };
    const lifetime = Number(a.lifetime_points ?? 0);
    const sorted = [...tiers].sort((x, y) => x.minPoints - y.minPoints);
    let tier = sorted[0];
    let nextTier: LoyaltyTier | null = null;
    for (let i = 0; i < sorted.length; i++) {
      if (lifetime >= sorted[i].minPoints) {
        tier = sorted[i];
        nextTier = sorted[i + 1] ?? null;
      }
    }
    return {
      memberId,
      points: Number(a.points ?? 0),
      lifetimePoints: lifetime,
      tier,
      nextTier,
      pointsToNextTier: nextTier ? Math.max(0, nextTier.minPoints - lifetime) : 0,
      memberSince: a.member_since,
      memberNumber: (member as Row)?.member_number ?? "—",
    };
  }

  async listLoyaltyTransactions(memberId: string): Promise<LoyaltyTransaction[]> {
    const { data } = await sb
      .from("loyalty_transactions")
      .select("*")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false });
    return ((data ?? []) as Row[]).map((t) => ({
      id: t.id,
      type: t.type,
      points: Number(t.points),
      reason: t.reason,
      reservationId: t.reservation_id ?? null,
      createdAt: t.created_at,
    }));
  }

  async listRewards(): Promise<Reward[]> {
    const { data } = await sb.from("rewards").select("*").eq("active", true).order("cost_points");
    return ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      name: r.name,
      costPoints: Number(r.cost_points),
      category: r.category,
      description: r.description,
    }));
  }

  private async earnPoints(
    memberId: string,
    euros: number,
    reservationId: string,
    propertyId: string | null,
  ) {
    const account = await this.getLoyaltyAccount(memberId);
    const points = Math.round(euros * account.tier.pointsPerEuro);
    if (points <= 0) return;
    await sb
      .from("loyalty_accounts")
      .update({
        points: account.points + points,
        lifetime_points: account.lifetimePoints + points,
      })
      .eq("member_id", memberId);
    await sb.from("loyalty_transactions").insert({
      id: uid("lt"),
      member_id: memberId,
      type: "earn",
      points,
      reason: "Estancia confirmada",
      reservation_id: reservationId,
      created_at: new Date().toISOString(),
    });
    await this.appendJournal(reservationId, "points_earned", {
      memberId,
      propertyId,
      payload: { points },
    });
  }

  async redeemReward(memberId: string, rewardId: string): Promise<LoyaltyAccount> {
    const [account, rewards] = await Promise.all([
      this.getLoyaltyAccount(memberId),
      this.listRewards(),
    ]);
    const reward = rewards.find((r) => r.id === rewardId);
    if (!reward) throw new Error("Recompensa no encontrada");
    if (account.points < reward.costPoints) throw new Error("Puntos insuficientes");
    await sb
      .from("loyalty_accounts")
      .update({ points: account.points - reward.costPoints })
      .eq("member_id", memberId);
    await sb.from("loyalty_transactions").insert({
      id: uid("lt"),
      member_id: memberId,
      type: "redeem",
      points: -reward.costPoints,
      reason: `Canje · ${reward.name}`,
      reservation_id: null,
      created_at: new Date().toISOString(),
    });
    await this.appendJournal(`reward-${rewardId}`, "reward_redeemed", {
      memberId,
      payload: { reward: reward.name, points: reward.costPoints },
    });
    return this.getLoyaltyAccount(memberId);
  }

  // ── Digital signature ──────────────────────────────────────────────────────

  async getSignature(reservationId: string): Promise<SignatureDoc | null> {
    const { data } = await sb
      .from("signatures")
      .select("*")
      .eq("reservation_id", reservationId)
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (!data) return null;
    const s = data as Row;
    return {
      id: s.id,
      reservationId: s.reservation_id,
      docType: s.doc_type,
      signerName: s.signer_name,
      signatureData: s.signature_data ?? null,
      status: s.status,
      signedAt: s.signed_at ?? null,
    };
  }

  async submitSignature(
    reservationId: string,
    docType: SignatureDocType,
    signerName: string,
    signatureData: string,
  ): Promise<SignatureDoc> {
    const nowIso = new Date().toISOString();
    const existing = await this.getSignature(reservationId);
    if (existing) {
      await sb
        .from("signatures")
        .update({
          signature_data: signatureData,
          signer_name: signerName,
          status: "signed",
          signed_at: nowIso,
        })
        .eq("id", existing.id);
    } else {
      await sb.from("signatures").insert({
        id: uid("sig"),
        reservation_id: reservationId,
        doc_type: docType,
        signer_name: signerName,
        signature_data: signatureData,
        status: "signed",
        signed_at: nowIso,
        created_at: nowIso,
      });
    }
    const { data: res } = await sb
      .from("reservations")
      .select("member_id,property_id")
      .eq("id", reservationId)
      .maybeSingle();
    const r = res as Row | null;
    await this.appendJournal(reservationId, "signed", {
      memberId: r?.member_id,
      propertyId: r?.property_id,
      payload: { doc: docType },
    });
    return (await this.getSignature(reservationId))!;
  }

  // ── Availability watches (notify when a room frees up) ─────────────────────

  private async mapWatch(r: Row): Promise<AvailabilityWatch> {
    const [{ data: room }, { data: property }] = await Promise.all([
      sb.from("rooms").select("name").eq("id", r.room_id).maybeSingle(),
      sb.from("properties").select("name").eq("id", r.property_id).maybeSingle(),
    ]);
    return {
      id: r.id,
      memberId: r.member_id,
      propertyId: r.property_id,
      propertyName: (property as Row)?.name ?? "Demo Stays",
      roomId: r.room_id,
      roomName: (room as Row)?.name ? `Habitación ${(room as Row).name}` : "Habitación",
      checkIn: r.check_in,
      checkOut: r.check_out,
      guests: Number(r.guests ?? 2),
      status: r.status,
      createdAt: r.created_at,
      notifiedAt: r.notified_at ?? null,
    };
  }

  async createWatch(input: CreateWatchInput): Promise<AvailabilityWatch> {
    // Avoid duplicate active watches for the same room+dates.
    const { data: existing } = await sb
      .from("availability_watches")
      .select("*")
      .eq("member_id", input.memberId)
      .eq("room_id", input.roomId)
      .eq("check_in", input.checkIn)
      .eq("check_out", input.checkOut)
      .eq("status", "watching")
      .maybeSingle();
    if (existing) return this.mapWatch(existing as Row);

    const { data: inserted } = await sb
      .from("availability_watches")
      .insert({
        id: uid("watch"),
        member_id: input.memberId,
        property_id: input.propertyId,
        room_id: input.roomId,
        check_in: input.checkIn,
        check_out: input.checkOut,
        guests: input.guests,
        status: "watching",
        notified_at: null,
        created_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    return this.mapWatch(inserted as Row);
  }

  async listWatches(memberId: string): Promise<AvailabilityWatch[]> {
    const { data } = await sb
      .from("availability_watches")
      .select("*")
      .eq("member_id", memberId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });
    return Promise.all(((data ?? []) as Row[]).map((r) => this.mapWatch(r)));
  }

  async cancelWatch(id: string): Promise<void> {
    await sb.from("availability_watches").update({ status: "cancelled" }).eq("id", id);
  }

  async pollWatches(memberId: string): Promise<AvailabilityWatch[]> {
    const { data } = await sb
      .from("availability_watches")
      .select("*")
      .eq("member_id", memberId)
      .eq("status", "watching");
    const rows = (data ?? []) as Row[];
    const freed: AvailabilityWatch[] = [];
    for (const r of rows) {
      const offers = await this.searchAvailability({
        propertyId: r.property_id,
        checkIn: r.check_in,
        checkOut: r.check_out,
        guests: Number(r.guests ?? 2),
      });
      const offer = offers.find((o) => o.room.id === r.room_id);
      if (offer?.available) {
        const nowIso = new Date().toISOString();
        await sb
          .from("availability_watches")
          .update({ status: "available", notified_at: nowIso })
          .eq("id", r.id);
        freed.push(await this.mapWatch({ ...r, status: "available", notified_at: nowIso }));
      }
    }
    return freed;
  }

  // ── Hotel facilities (instalaciones) ────────────────────────────────────────────

  private mapSpace(r: Row, propName: string): CommonSpace {
    return {
      id: r.id,
      propertyId: r.property_id,
      propertyName: propName,
      name: r.name,
      kind: r.kind,
      capacity: Number(r.capacity ?? 1),
      description: r.description ?? "",
      openHour: Number(r.open_hour ?? 8),
      closeHour: Number(r.close_hour ?? 22),
      pricePerHour: Number(r.price_per_hour ?? 0),
    };
  }

  async listCommonSpaces(filter?: { propertyId?: string }): Promise<CommonSpace[]> {
    let q = sb.from("common_spaces").select("*").eq("active", true).order("sort_order");
    if (filter?.propertyId) q = q.eq("property_id", filter.propertyId);
    const { data } = await q;
    const rows = (data ?? []) as Row[];
    const { data: props } = await sb.from("properties").select("id,name");
    const nameById = new Map(((props ?? []) as Row[]).map((p) => [p.id, p.name]));
    return rows.map((r) => this.mapSpace(r, nameById.get(r.property_id) ?? "Demo Stays"));
  }

  private async mapSpaceBooking(r: Row): Promise<SpaceBooking> {
    const { data: space } = await sb
      .from("common_spaces")
      .select("name,kind,property_id")
      .eq("id", r.space_id)
      .maybeSingle();
    const s = space as Row | null;
    const { data: prop } = s?.property_id
      ? await sb.from("properties").select("name").eq("id", s.property_id).maybeSingle()
      : { data: null };
    return {
      id: r.id,
      memberId: r.member_id,
      spaceId: r.space_id,
      spaceName: s?.name ?? "Instalación",
      spaceKind: s?.kind ?? "spa",
      propertyName: (prop as Row)?.name ?? "Demo Stays",
      date: r.date,
      startHour: Number(r.start_hour),
      endHour: Number(r.end_hour),
      guests: Number(r.guests ?? 1),
      total: Number(r.total ?? 0),
      status: r.status,
      createdAt: r.created_at,
    };
  }

  async bookCommonSpace(input: BookSpaceInput): Promise<SpaceBooking> {
    const { data: space } = await sb
      .from("common_spaces")
      .select("*")
      .eq("id", input.spaceId)
      .maybeSingle();
    if (!space) throw new Error("Instalación no encontrada");
    const s = space as Row;

    // Reject overlapping confirmed bookings of the same space on the same day.
    const { data: clashes } = await sb
      .from("space_bookings")
      .select("start_hour,end_hour,status")
      .eq("space_id", input.spaceId)
      .eq("date", input.date)
      .eq("status", "confirmed");
    for (const c of (clashes ?? []) as Row[]) {
      if (input.startHour < Number(c.end_hour) && Number(c.start_hour) < input.endHour) {
        throw new Error("Ese tramo ya está reservado");
      }
    }

    const hours = Math.max(1, input.endHour - input.startHour);
    const total = round2(hours * Number(s.price_per_hour ?? 0));
    const { data: inserted } = await sb
      .from("space_bookings")
      .insert({
        id: uid("sp"),
        member_id: input.memberId,
        space_id: input.spaceId,
        date: input.date,
        start_hour: input.startHour,
        end_hour: input.endHour,
        guests: input.guests,
        total,
        status: "confirmed",
        created_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    return this.mapSpaceBooking(inserted as Row);
  }

  async listSpaceBookings(memberId: string): Promise<SpaceBooking[]> {
    const { data } = await sb
      .from("space_bookings")
      .select("*")
      .eq("member_id", memberId)
      .order("date", { ascending: false });
    return Promise.all(((data ?? []) as Row[]).map((r) => this.mapSpaceBooking(r)));
  }

  async cancelSpaceBooking(id: string): Promise<void> {
    await sb.from("space_bookings").update({ status: "cancelled" }).eq("id", id);
  }

  // ── Invoices (facturas) ──────────────────────────────────────────────────────

  async listInvoices(memberId: string): Promise<Invoice[]> {
    const { data } = await sb
      .from("invoices")
      .select("*")
      .eq("member_id", memberId)
      .order("issued_at", { ascending: false });
    return ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      memberId: r.member_id,
      number: r.number,
      concept: r.concept,
      propertyName: r.property_name ?? null,
      issuedAt: r.issued_at,
      dueAt: r.due_at,
      net: Number(r.net ?? 0),
      tax: Number(r.tax ?? 0),
      amount: Number(r.amount ?? 0),
      status: r.status,
    }));
  }

  // ── Guest requests (peticiones) ──────────────────────────────────────────────────

  private mapIncident(r: Row): Incident {
    return {
      id: r.id,
      memberId: r.member_id,
      propertyName: r.property_name ?? null,
      category: r.category,
      title: r.title,
      description: r.description,
      status: r.status,
      createdAt: r.created_at,
      updates: Array.isArray(r.updates) ? r.updates : [],
    };
  }

  async listIncidents(memberId: string): Promise<Incident[]> {
    const { data } = await sb
      .from("incidents")
      .select("*")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false });
    return ((data ?? []) as Row[]).map((r) => this.mapIncident(r));
  }

  async createIncident(input: CreateIncidentInput): Promise<Incident> {
    const nowIso = new Date().toISOString();
    const row: Row = {
      id: uid("inc"),
      member_id: input.memberId,
      property_name: input.propertyName ?? null,
      category: input.category,
      title: input.title,
      description: input.description,
      status: "open",
      created_at: nowIso,
      updates: [
        {
          at: nowIso,
          status: "open",
          note: "Petición recibida. Recepción la gestionará en breve.",
        },
      ],
    };
    await sb.from("incidents").insert(row);
    return this.mapIncident(row);
  }

  // ── Booking journal ────────────────────────────────────────────────────────

  async listJournal(filter?: {
    bookingRef?: string;
    memberId?: string;
    propertyId?: string;
    eventType?: JournalEventType;
  }): Promise<JournalEntry[]> {
    let q = sb.from("booking_journal").select("*").order("created_at", { ascending: false });
    if (filter?.bookingRef) q = q.eq("booking_ref", filter.bookingRef);
    if (filter?.memberId) q = q.eq("member_id", filter.memberId);
    if (filter?.propertyId) q = q.eq("property_id", filter.propertyId);
    if (filter?.eventType) q = q.eq("event_type", filter.eventType);
    const { data } = await q;
    return ((data ?? []) as Row[]).map((e) => ({
      id: e.id,
      bookingRef: e.booking_ref,
      memberId: e.member_id ?? null,
      propertyId: e.property_id ?? null,
      eventType: e.event_type,
      actor: e.actor,
      payload: e.payload ?? {},
      createdAt: e.created_at,
    }));
  }
}
