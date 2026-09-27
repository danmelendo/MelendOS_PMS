import { describe, expect, it } from "vitest";
import { customerEmail, leadEmail, leadWhen, type LeadForEmail } from "./lead-email.ts";

const lead: LeadForEmail = {
  id: "0f8b6c1e-0000-4000-8000-000000000001",
  kind: "demo",
  slot_start: "2026-09-28T08:00:00Z",
  name: "Laura <script>",
  email: "laura@hostal.es",
  company: "Hostal Mar",
  phone: null,
  hotels: 1,
  rooms: 10,
  plan: "hostal",
  message: "Ver SES.HOSPEDAJES\ny la web",
  marketing_ok: false,
  utm_source: "google",
  utm_medium: "cpc",
  utm_campaign: null,
  referrer: null,
  page: "/demo/",
};

describe("leadEmail", () => {
  it("says when, in Madrid time", () => {
    expect(leadWhen("2026-09-28T08:00:00Z")).toBe("lunes, 28 de septiembre, 10:00");
    expect(leadWhen(null)).toMatch(/Sin cita/);
  });

  it("builds the subject, the rows and the panel link", () => {
    const m = leadEmail(lead, "https://melendos.es/");
    expect(m.subject).toBe("Nueva demo: Hostal Mar · lunes, 28 de septiembre, 10:00");
    expect(m.text).toContain("Plan: Hostal");
    expect(m.text).toContain("Origen: google / cpc");
    expect(m.html).toContain(
      "https://melendos.es/admin/?lead=0f8b6c1e-0000-4000-8000-000000000001",
    );
    expect(leadEmail({ ...lead, kind: "contact", slot_start: null }).subject).toBe(
      "Nuevo contacto: Hostal Mar",
    );
  });

  it("escapes what the visitor wrote", () => {
    const m = leadEmail(lead);
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("Laura &lt;script&gt;");
    expect(m.html).toContain("SES.HOSPEDAJES<br>y la web");
    expect(m.html).not.toContain("Abrir en el panel");
  });
});

describe("customerEmail", () => {
  it("confirms the demo with its time and a calendar file", () => {
    const m = customerEmail(lead, "https://melendo.app");
    expect(m.subject).toBe("Tu demo de Melend/OS: lunes, 28 de septiembre, 10:00");
    expect(m.html).toContain("Hola, Laura:");
    expect(m.html).toContain("<b>lunes, 28 de septiembre, 10:00</b>");
    expect(m.html).toContain("https://melendo.app/precios/");
    expect(m.text).not.toContain("<b>");
    expect(m.ics).toContain("DTSTART:20260928T080000Z");
    expect(m.ics).toContain("DTEND:20260928T083000Z");
    expect(m.ics).toContain(`UID:${lead.id}@melendo.app`);
  });

  it("acknowledges a request without a slot, with no calendar file", () => {
    const m = customerEmail({ ...lead, kind: "contact", slot_start: null });
    expect(m.subject).toBe("Hemos recibido tu solicitud · Melend/OS");
    expect(m.ics).toBeNull();
    expect(m.html).not.toContain("precios");
  });

  it("escapes the name", () => {
    expect(customerEmail(lead).html).not.toContain("<script>");
  });
});
