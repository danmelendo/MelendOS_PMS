import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AUTH_EMAIL_KINDS, authEmail } from "./auth-templates.ts";

describe("authEmail", () => {
  it("keeps Auth's placeholders", () => {
    for (const kind of AUTH_EMAIL_KINDS) {
      const { html } = authEmail(kind);
      expect(html).toContain('href="{{ .ConfirmationURL }}"');
      expect(html).toContain("{{ .Email }}");
      expect(html).toContain('src="{{ .SiteURL }}/email-templates/melendos-logo.png"');
      expect(html).toContain('src="{{ .SiteURL }}/email-templates/melendos-footer.jpg"');
    }
    expect(authEmail("email_change").html).toContain("{{ .NewEmail }}");
  });

  it("matches the files the installations serve (node scripts/email-templates.ts)", () => {
    for (const kind of AUTH_EMAIL_KINDS) {
      expect(readFileSync(`public/email-templates/${kind}.html`, "utf8")).toBe(
        authEmail(kind).html,
      );
    }
  });
});
