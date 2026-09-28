// EmailStore over Supabase (service role: every query scopes by the email's
// reservation or tenant).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ymdInZone } from "../domain/dates.ts";
import type { BookingForEmail, EmailStore, PendingEmail } from "./dispatch.ts";

interface Row {
  tenant_id: string;
  reference: string;
  start_at: string;
  end_at: string;
  people: number;
  total: number;
  paid_amount: number | null;
  payment_mode: "prepay" | "at_hotel";
  free_cancellation_until: string | null;
  guest_lang: "es" | "en" | null;
  rooms: { name: string } | null;
  customers: { name: string | null; email: string | null } | null;
  members: { name: string | null; email: string | null } | null;
  tenants: {
    name: string;
    slug: string;
    domain: string | null;
    brand: Record<string, unknown> | null;
    settings: Record<string, unknown> | null;
  } | null;
}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function supabaseEmailStore(db: SupabaseClient, publicWebUrl: string | null): EmailStore {
  return {
    async pending(limit) {
      const { data, error } = await db
        .from("guest_emails")
        .select("id, tenant_id, reservation_id, kind, attempts")
        .eq("status", "pending")
        .order("created_at")
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as PendingEmail[];
    },
    async booking(reservationId) {
      const { data, error } = await db
        .from("reservations")
        .select(
          "tenant_id, reference, start_at, end_at, people, total, paid_amount, payment_mode, free_cancellation_until, guest_lang, rooms(name), customers(name, email), members(name, email), tenants(name, slug, domain, brand, settings)",
        )
        .eq("id", reservationId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const r = data as unknown as Row | null;
      if (!r || !r.tenants) return null;
      const s = r.tenants.settings ?? {};
      const b = r.tenants.brand ?? {};
      const tz = String(s.timezone ?? "Europe/Madrid");
      const guest = r.customers ?? r.members;
      const booking: BookingForEmail = {
        to: text(guest?.email),
        guestName: text(guest?.name),
        hotelName: text(b.name) ?? r.tenants.name,
        hotelSlug: r.tenants.slug,
        accent: text(b.accent),
        hotelEmail: text(b.email),
        hotelPhone: text(b.phone),
        hotelAddress: text(b.address),
        reference: r.reference,
        roomName: r.rooms?.name ?? "",
        checkIn: ymdInZone(r.start_at, tz),
        checkOut: ymdInZone(r.end_at, tz),
        checkInHour: Number(s.checkin_hour ?? 15),
        checkOutHour: Number(s.checkout_hour ?? 12),
        guests: r.people,
        total: Number(r.total),
        paymentMode: r.payment_mode,
        paid: Number(r.paid_amount ?? 0),
        freeCancellationUntil: r.free_cancellation_until,
        lang: r.guest_lang,
        timezone: tz,
        // The hotel's own domain; otherwise the shared booking web.
        webUrl: r.tenants.domain
          ? `https://${r.tenants.domain}`
          : (publicWebUrl ?? "https://demostays.example"),
      };
      return booking;
    },
    async issueToken(tenantId, reservationId, tokenHash, expiresAt) {
      const { error } = await db.from("booking_access_tokens").insert({
        tenant_id: tenantId,
        reservation_id: reservationId,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
      });
      if (error) throw new Error(error.message);
    },
    async markDone(email, status, detail) {
      const { error } = await db
        .from("guest_emails")
        .update({
          status,
          to_email: detail.to ?? null,
          provider_id: detail.providerId ?? null,
          error: detail.error ?? null,
          attempts: email.attempts + 1,
          sent_at: status === "skipped" ? null : new Date().toISOString(),
        })
        .eq("id", email.id);
      if (error) throw new Error(error.message);
      if (email.kind === "booking_confirmed" && status !== "skipped") {
        await db
          .from("reservations")
          .update({
            confirmation_email_sent_at: new Date().toISOString(),
            confirmation_email_error: null,
          })
          .eq("id", email.reservation_id);
      }
    },
    async markFailed(email, message, final) {
      await db
        .from("guest_emails")
        .update({
          status: final ? "failed" : "pending",
          attempts: email.attempts + 1,
          error: message,
        })
        .eq("id", email.id);
      if (final && email.kind === "booking_confirmed") {
        await db
          .from("reservations")
          .update({ confirmation_email_error: message })
          .eq("id", email.reservation_id);
      }
    },
  };
}
