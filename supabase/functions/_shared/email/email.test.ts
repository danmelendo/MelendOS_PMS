import { describe, expect, it } from "vitest";
import { bookingEmail, type BookingEmailData } from "./templates.ts";
import {
  dispatchEmails,
  MAX_ATTEMPTS,
  senderFor,
  type BookingForEmail,
  type EmailStore,
  type EmailTransport,
  type OutgoingEmail,
  type PendingEmail,
} from "./dispatch.ts";

const data: BookingEmailData = {
  kind: "booking_confirmed",
  hotelName: "Hotel Lumen",
  accent: "#0f766e",
  hotelEmail: "recepcion@lumen.example",
  hotelPhone: "+34 960 000 000",
  hotelAddress: "Calle Mayor 1, Valencia",
  guestName: "Laura Gómez",
  reference: "AB12CD34",
  roomName: "101",
  checkIn: "2026-10-15",
  checkOut: "2026-10-18",
  checkInHour: 15,
  checkOutHour: 12,
  guests: 2,
  total: 360,
  paymentMode: "prepay",
  paid: 360,
  freeCancellationUntil: "2026-10-13T13:00:00Z",
  timezone: "Europe/Madrid",
  manageUrl: "https://reservas.lumen.example/web/booking/r1?t=abc",
};

describe("bookingEmail", () => {
  it("confirms the stay with dates, price, cancellation terms and the link", () => {
    const e = bookingEmail(data);
    expect(e.subject).toBe("Reserva confirmada en Hotel Lumen · AB12CD34");
    expect(e.text).toContain("Hola, Laura:");
    expect(e.text).toContain("Entrada: jueves, 15 de octubre de 2026, desde las 15:00");
    expect(e.text).toContain("Noches: 3");
    expect(e.text).toContain("pagado");
    expect(e.text).toContain("Cancelación gratuita hasta el 13 de octubre a las 15:00");
    expect(e.html).toContain('href="https://reservas.lumen.example/web/booking/r1?t=abc"');
    expect(e.html).toContain("background:#0f766e");
  });

  it("says what is paid at the hotel and when there is no free cancellation", () => {
    const e = bookingEmail({
      ...data,
      paymentMode: "at_hotel",
      paid: 0,
      freeCancellationUntil: null,
    });
    expect(e.text).toContain("que pagas en el hotel");
    expect(e.text).toContain("no tiene cancelación gratuita");
  });

  it("tells a cancelled guest about the refund of what was paid online", () => {
    const e = bookingEmail({ ...data, kind: "booking_cancelled" });
    expect(e.subject).toBe("Reserva cancelada en Hotel Lumen · AB12CD34");
    expect(e.text).toContain("devolución");
    expect(e.text).not.toContain("check-in online");
  });

  it("escapes what the hotel or the guest typed", () => {
    const e = bookingEmail({
      ...data,
      hotelName: "Hotel <script>",
      guestName: 'Ana "x"',
      accent: "red;x",
    });
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("Hotel &lt;script&gt;");
    expect(e.html).toContain("background:#1e3a5f"); // an invalid colour falls back
  });
});

describe("dispatchEmails", () => {
  const booking: BookingForEmail = {
    ...data,
    to: "laura@example.com",
    hotelSlug: "hotel-lumen",
    webUrl: "https://reservas.lumen.example/",
  };
  const pending = (over: Partial<PendingEmail> = {}): PendingEmail => ({
    id: "e1",
    tenant_id: "t1",
    reservation_id: "r1",
    kind: "booking_confirmed",
    attempts: 0,
    ...over,
  });

  function fake(queue: PendingEmail[], found: BookingForEmail | null = booking) {
    const log: string[] = [];
    const tokens: { hash: string; expires: Date }[] = [];
    const store: EmailStore = {
      async pending() {
        return queue;
      },
      async booking() {
        return found;
      },
      async issueToken(_t, _r, hash, expires) {
        tokens.push({ hash, expires });
      },
      async markDone(e, status, d) {
        log.push(`${e.id}:${status}:${d.to ?? d.error ?? ""}`);
      },
      async markFailed(e, error, final) {
        log.push(`${e.id}:failed${final ? "!" : ""}:${error}`);
      },
    };
    return { store, log, tokens };
  }
  const outbox: OutgoingEmail[] = [];
  const transport = (mode: EmailTransport["mode"], fail = false): EmailTransport => ({
    mode,
    async send(e) {
      if (fail) throw new Error("provider down");
      outbox.push(e);
      return { id: "msg-1" };
    },
  });

  it("sends from the hotel's name, replying to the hotel, with a fresh link", async () => {
    outbox.length = 0;
    const { store, log, tokens } = fake([pending()]);
    const report = await dispatchEmails(store, transport("resend"), {
      fromAddress: "reservas@melendo.app",
      now: new Date("2026-09-28T08:00:00Z"),
    });
    expect(report).toEqual({ sent: 1, simulated: 0, skipped: 0, failed: 0 });
    expect(log).toEqual(["e1:sent:laura@example.com"]);
    expect(outbox[0]).toMatchObject({
      to: "laura@example.com",
      from: '"Hotel Lumen" <reservas@melendo.app>',
      replyTo: "recepcion@lumen.example",
    });
    const link = outbox[0].text.match(/https:\/\/\S+/)![0];
    expect(link).toMatch(
      /^https:\/\/reservas\.lumen\.example\/web\/booking\/r1\?t=[0-9a-f]{48}&hotel=hotel-lumen$/,
    );
    // Only the hash is stored; the link lasts until a week after check-out.
    expect(tokens[0].hash).toMatch(/^[0-9a-f]{64}$/);
    expect(link).not.toContain(tokens[0].hash);
    expect(tokens[0].expires.toISOString()).toBe("2026-10-28T08:00:00.000Z"); // 30 days min
  });

  it("keeps simulated emails in the log, skips bookings without email and retries failures", async () => {
    const simulated = fake([pending()]);
    expect(
      await dispatchEmails(simulated.store, transport("simulated"), { fromAddress: "x@y.z" }),
    ).toMatchObject({ simulated: 1 });

    const noEmail = fake([pending()], { ...booking, to: null });
    await dispatchEmails(noEmail.store, transport("resend"), { fromAddress: "x@y.z" });
    expect(noEmail.log).toEqual(["e1:skipped:Reserva sin email del huésped"]);

    const failing = fake([pending(), pending({ id: "e2", attempts: MAX_ATTEMPTS - 1 })]);
    await dispatchEmails(failing.store, transport("resend", true), { fromAddress: "x@y.z" });
    expect(failing.log).toEqual(["e1:failed:provider down", "e2:failed!:provider down"]);
  });

  it("never lets a hotel name break the sender header", () => {
    expect(senderFor('Hotel "Sol" <x>\r\nBcc: a@b.c', "r@m.app")).toBe(
      '"Hotel Sol xBcc: a@b.c" <r@m.app>',
    );
  });
});
