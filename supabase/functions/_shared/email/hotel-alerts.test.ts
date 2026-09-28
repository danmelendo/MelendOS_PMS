import { describe, expect, it } from "vitest";
import type { EmailTransport, OutgoingEmail } from "./dispatch.ts";
import {
  dispatchHotelAlerts,
  hotelAlertEmail,
  type HotelAlertStore,
  type PendingNotice,
} from "./hotel-alerts.ts";
import { hotelAlertText } from "../domain/hotel-alerts.ts";

const notice = (over: Partial<PendingNotice> = {}): PendingNotice => ({
  id: crypto.randomUUID(),
  tenant_id: "lumen",
  kind: "ses_blocked",
  items: 1,
  attempts: 0,
  ...over,
});

function fakes(opts: { recipients?: string[]; failSend?: boolean } = {}) {
  const pending: PendingNotice[] = [];
  const marks: { ids: string[]; status: string; error?: string }[] = [];
  const sent: OutgoingEmail[] = [];
  const store: HotelAlertStore = {
    async pending() {
      return pending;
    },
    async hotel(tenantId) {
      return {
        name: tenantId === "lumen" ? "Hotel Lumen" : "Albora",
        recipients: opts.recipients ?? ["dir@lumen.example"],
      };
    },
    async mark(ids, status, detail) {
      marks.push({ ids, status, error: detail.error });
    },
  };
  const transport: EmailTransport = {
    mode: "resend",
    async send(e) {
      if (opts.failSend) throw new Error("Resend 500: down");
      sent.push(e);
      return { id: "x" };
    },
  };
  return { pending, marks, sent, store, transport };
}

describe("hotel alert texts", () => {
  it("say one or many", () => {
    expect(hotelAlertText("ses_blocked", 1)).toBe(
      "1 parte sin enviar porque faltan datos de los viajeros",
    );
    expect(hotelAlertText("verifactu_rejected", 3)).toMatch(/^3 registros rechazados/);
  });
});

describe("hotelAlertEmail", () => {
  it("lists every notice with a link to where it is fixed", () => {
    const e = hotelAlertEmail(
      "Hotel Lumen",
      [notice(), notice({ kind: "email_failed", items: 2 })],
      "https://app.melendo.app/",
    );
    expect(e.subject).toBe("Hotel Lumen: 2 cosas necesitan tu atención");
    expect(e.text).toContain("Registro de viajeros: 1 parte sin enviar");
    expect(e.text).toContain("https://app.melendo.app/travellers");
    expect(e.html).toContain('href="https://app.melendo.app/reservations"');
  });
  it("escapes the hotel name", () => {
    expect(hotelAlertEmail("<b>Hotel</b>", [notice()], null).html).not.toContain("<b>Hotel</b>");
  });
});

describe("dispatchHotelAlerts", () => {
  it("sends one email per hotel to each person of management and marks the notices", async () => {
    const f = fakes({ recipients: ["a@lumen.example", "b@lumen.example"] });
    f.pending.push(notice(), notice({ kind: "channel_error" }), notice({ tenant_id: "albora" }));
    const r = await dispatchHotelAlerts(f.store, f.transport, {
      fromAddress: "avisos@melendo.app",
      panelUrl: null,
    });
    expect(r).toEqual({ sent: 2, simulated: 0, skipped: 0, failed: 0 });
    expect(f.sent).toHaveLength(4);
    expect(f.sent[0].from).toBe('"Melend/OS" <avisos@melendo.app>');
    expect(f.marks.map((m) => [m.ids.length, m.status])).toEqual([
      [2, "sent"],
      [1, "sent"],
    ]);
  });

  it("skips a hotel without anyone in management", async () => {
    const f = fakes({ recipients: [] });
    f.pending.push(notice());
    const r = await dispatchHotelAlerts(f.store, f.transport, {
      fromAddress: "a@b.c",
      panelUrl: null,
    });
    expect(r.skipped).toBe(1);
    expect(f.marks[0].status).toBe("skipped");
  });

  it("retries on a provider error and gives up after the last attempt", async () => {
    const f = fakes({ failSend: true });
    f.pending.push(notice({ attempts: 0 }));
    await dispatchHotelAlerts(f.store, f.transport, { fromAddress: "a@b.c", panelUrl: null });
    expect(f.marks[0]).toMatchObject({ status: "pending", error: "Resend 500: down" });

    const g = fakes({ failSend: true });
    g.pending.push(notice({ attempts: 4 }));
    await dispatchHotelAlerts(g.store, g.transport, { fromAddress: "a@b.c", panelUrl: null });
    expect(g.marks[0].status).toBe("failed");
  });
});
