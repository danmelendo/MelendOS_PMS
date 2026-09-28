// Email to a hotel's management when something only the hotel can fix shows
// up (hotel_alert_notices, opened and closed by hotel_alerts_scan()): one
// email per hotel with every new notice, once per episode. Same wording as the
// notice in "Hoy" (@domain/hotel-alerts). Pure logic, tested with fakes.
import { HOTEL_ALERT_KINDS, hotelAlertText } from "../domain/hotel-alerts.ts";
import { MAX_ATTEMPTS, senderFor, type EmailTransport } from "./dispatch.ts";

export interface PendingNotice {
  id: string;
  tenant_id: string;
  kind: string;
  items: number;
  attempts: number;
}

export interface HotelAlertStore {
  pending(limit: number): Promise<PendingNotice[]>;
  hotel(tenantId: string): Promise<{ name: string; recipients: string[] } | null>;
  mark(
    ids: string[],
    status: "sent" | "simulated" | "skipped" | "failed" | "pending",
    detail: { error?: string; attempt?: boolean },
  ): Promise<void>;
}

export interface HotelAlertReport {
  sent: number;
  simulated: number;
  skipped: number;
  failed: number;
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function hotelAlertEmail(hotel: string, notices: PendingNotice[], panelUrl: string | null) {
  const lines = notices.map((n) => {
    const k = HOTEL_ALERT_KINDS[n.kind];
    const url = panelUrl && k ? `${panelUrl.replace(/\/+$/, "")}${k.path}` : null;
    return { area: k?.area ?? "Aviso", text: hotelAlertText(n.kind, Number(n.items)), url };
  });
  const subject =
    notices.length === 1
      ? `${hotel}: ${lines[0].area.toLowerCase()} necesita tu atención`
      : `${hotel}: ${notices.length} cosas necesitan tu atención`;
  const text = [
    `Hola,`,
    ``,
    `En ${hotel} hay algo que tiene que revisar alguien del hotel:`,
    ``,
    ...lines.map((l) => `- ${l.area}: ${l.text}${l.url ? `\n  ${l.url}` : ""}`),
    ``,
    `También lo ves en el panel, en «Hoy». Te avisamos una sola vez por cada problema; cuando se resuelva, desaparece del panel.`,
    ``,
    `Melend/OS`,
  ].join("\n");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f1b33;max-width:560px">
<p>Hola,</p>
<p>En <strong>${escape(hotel)}</strong> hay algo que tiene que revisar alguien del hotel:</p>
<ul style="padding-left:18px">${lines
    .map(
      (l) =>
        `<li style="margin:6px 0"><strong>${escape(l.area)}</strong>: ${escape(l.text)}${
          l.url ? ` · <a href="${escape(l.url)}">Abrir en el panel</a>` : ""
        }</li>`,
    )
    .join("")}</ul>
<p style="color:#5b6477;font-size:13px">También lo ves en el panel, en «Hoy». Te avisamos una sola vez por cada problema; cuando se resuelva, desaparece del panel.</p>
<p style="color:#5b6477;font-size:13px">Melend/OS</p>
</div>`;
  return { subject, text, html };
}

export async function dispatchHotelAlerts(
  store: HotelAlertStore,
  transport: EmailTransport,
  opts: { fromAddress: string; panelUrl: string | null; limit?: number },
): Promise<HotelAlertReport> {
  const report: HotelAlertReport = { sent: 0, simulated: 0, skipped: 0, failed: 0 };
  const byHotel = new Map<string, PendingNotice[]>();
  for (const n of await store.pending(opts.limit ?? 100)) {
    byHotel.set(n.tenant_id, [...(byHotel.get(n.tenant_id) ?? []), n]);
  }
  for (const [tenantId, notices] of byHotel) {
    const ids = notices.map((n) => n.id);
    try {
      const hotel = await store.hotel(tenantId);
      if (!hotel || !hotel.recipients.length) {
        await store.mark(ids, "skipped", {
          error: "El hotel no tiene nadie de dirección con email",
        });
        report.skipped++;
        continue;
      }
      const email = hotelAlertEmail(hotel.name, notices, opts.panelUrl);
      for (const to of hotel.recipients) {
        await transport.send({
          to,
          from: senderFor("Melend/OS", opts.fromAddress),
          replyTo: null,
          ...email,
        });
      }
      const status = transport.mode === "simulated" ? "simulated" : "sent";
      await store.mark(ids, status, {});
      report[status]++;
    } catch (e) {
      const final = Math.max(...notices.map((n) => n.attempts)) + 1 >= MAX_ATTEMPTS;
      await store.mark(ids, final ? "failed" : "pending", {
        error: (e as Error).message.slice(0, 500),
        attempt: true,
      });
      report.failed++;
    }
  }
  return report;
}
