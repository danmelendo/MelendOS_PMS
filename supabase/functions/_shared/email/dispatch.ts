// Sends the queued guest emails (guest_emails, filled by a trigger on
// reservations). Each email carries a fresh access link valid until a week
// after check-out, so the guest can manage the booking without an account.
// Pure logic over EmailStore and EmailTransport, tested with fakes.
import { bookingEmail, type BookingEmailData, type BookingEmailKind } from "./templates.ts";

export interface PendingEmail {
  id: string;
  tenant_id: string;
  reservation_id: string;
  kind: BookingEmailKind;
  attempts: number;
}

export type BookingForEmail = Omit<BookingEmailData, "kind" | "manageUrl"> & {
  /** Guest email (customer or member); null when the booking has none. */
  to: string | null;
  /** Hotel slug, so the demo web (several hotels) opens the right one. */
  hotelSlug: string;
  /** The hotel's booking web: its own domain, or the shared one. */
  webUrl: string;
};

export interface EmailStore {
  pending(limit: number): Promise<PendingEmail[]>;
  booking(reservationId: string): Promise<BookingForEmail | null>;
  /**
   * Stores an extra access token (its hash) for the booking. A "checkin" token
   * is single-use: it opens only the check-in flow and is consumed on signing.
   */
  issueToken(
    tenantId: string,
    reservationId: string,
    tokenHash: string,
    expiresAt: Date,
    purpose: "manage" | "checkin",
  ): Promise<void>;
  markDone(
    email: PendingEmail,
    status: "sent" | "simulated" | "skipped",
    detail: { to?: string; providerId?: string | null; error?: string },
  ): Promise<void>;
  markFailed(email: PendingEmail, error: string, final: boolean): Promise<void>;
}

export interface OutgoingEmail {
  to: string;
  from: string;
  replyTo: string | null;
  subject: string;
  html: string;
  text: string;
}

export interface EmailTransport {
  /** "simulated" keeps the email in the log without sending it. */
  mode: "resend" | "simulated";
  send(email: OutgoingEmail): Promise<{ id: string | null }>;
}

export const MAX_ATTEMPTS = 5;

export interface EmailReport {
  sent: number;
  simulated: number;
  skipped: number;
  failed: number;
}

async function newToken(): Promise<{ token: string; hash: string }> {
  const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  const token = hex(crypto.getRandomValues(new Uint8Array(24)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return { token, hash: hex(new Uint8Array(digest)) };
}

/** Sender shown to the guest: the hotel's name over the platform address. */
export function senderFor(hotelName: string, address: string): string {
  const name = hotelName.replace(/["<>\r\n]/g, "").trim() || "Reservas";
  return `"${name}" <${address}>`;
}

export async function dispatchEmails(
  store: EmailStore,
  transport: EmailTransport,
  opts: { fromAddress: string; now?: Date; limit?: number },
): Promise<EmailReport> {
  const now = opts.now ?? new Date();
  const report: EmailReport = { sent: 0, simulated: 0, skipped: 0, failed: 0 };
  for (const email of await store.pending(opts.limit ?? 50)) {
    try {
      const b = await store.booking(email.reservation_id);
      if (!b || !b.to) {
        await store.markDone(email, "skipped", { error: "Reserva sin email del huésped" });
        report.skipped++;
        continue;
      }
      // The link works until a week after check-out (and at least 30 days).
      const expires = new Date(
        Math.max(
          Date.parse(`${b.checkOut}T12:00:00Z`) + 7 * 86_400_000,
          now.getTime() + 30 * 86_400_000,
        ),
      );
      // A check-in invite carries a single-use link straight to the check-in
      // flow; the other emails carry the reusable "manage my booking" link.
      const checkin = email.kind === "checkin_invite";
      const { token, hash } = await newToken();
      await store.issueToken(
        email.tenant_id,
        email.reservation_id,
        hash,
        expires,
        checkin ? "checkin" : "manage",
      );
      const base = b.webUrl.replace(/\/+$/, "");
      const query = `?t=${token}&hotel=${encodeURIComponent(b.hotelSlug)}`;
      const manageUrl = checkin
        ? `${base}/web/checkin/${email.reservation_id}${query}`
        : `${base}/web/booking/${email.reservation_id}${query}`;
      const rendered = bookingEmail({ ...b, kind: email.kind, manageUrl });
      const res = await transport.send({
        to: b.to,
        from: senderFor(b.hotelName, opts.fromAddress),
        replyTo: b.hotelEmail,
        ...rendered,
      });
      const status = transport.mode === "simulated" ? "simulated" : "sent";
      await store.markDone(email, status, { to: b.to, providerId: res.id });
      report[status]++;
    } catch (e) {
      const final = email.attempts + 1 >= MAX_ATTEMPTS;
      await store.markFailed(email, (e as Error).message.slice(0, 500), final);
      report.failed++;
    }
  }
  return report;
}
