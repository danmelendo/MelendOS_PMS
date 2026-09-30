// Writes the sign-in email templates of Auth (supabase/functions/_shared/email/
// auth-templates.ts) to public/email-templates/, where each installation's Auth
// reads them (AUTH_TEMPLATES_URL). Run after changing them; a test checks that
// the files are up to date.
// Usage: node scripts/email-templates.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { AUTH_EMAIL_KINDS, authEmail } from "../supabase/functions/_shared/email/auth-templates.ts";

mkdirSync("public/email-templates", { recursive: true });
for (const kind of AUTH_EMAIL_KINDS) {
  writeFileSync(`public/email-templates/${kind}.html`, authEmail(kind).html);
  console.log(`public/email-templates/${kind}.html · ${authEmail(kind).subject}`);
}
