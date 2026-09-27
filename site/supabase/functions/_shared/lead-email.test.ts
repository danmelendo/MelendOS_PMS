import { describe, expect, it } from "vitest";
import { leadEmail, leadWhen, type LeadForEmail } from "./lead-email.ts";

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
