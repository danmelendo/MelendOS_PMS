// End-to-end check of two-step verification against the demo project: a
// temporary admin of Lumen turns on TOTP (the code is computed here,
// as an authenticator app would), and from then on a password-only session
// sees nothing of the hotel while a session verified with the code does.
// The temporary user is deleted at the end.
// Usage: node --env-file=.env scripts/e2e-mfa.mjs
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env;
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const client = () =>
  createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!cond) failures++;
};

// RFC 6238 TOTP (SHA-1, 30 s, 6 digits) from a base32 secret.
function totp(secret, at = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

const email = `e2e-mfa-${randomUUID().slice(0, 8)}@demostays.example`;
const password = randomUUID();
let userId = null;
try {
  const { data: tenant } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", "hotel-lumen")
    .single();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  userId = created.user.id;
  const { error: memberError } = await admin
    .from("tenant_members")
    .insert({ tenant_id: tenant.id, user_id: userId, role: "admin" });
  if (memberError) throw memberError;

  const reservations = async (c) =>
    (
      await c
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.id)
    ).count ?? 0;

  const s1 = client();
  await s1.auth.signInWithPassword({ email, password });
  check("without two-step verification the password is enough", (await reservations(s1)) > 0);

  const { data: enrolled, error: enrollError } = await s1.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "e2e",
  });
  check("the project allows TOTP enrolment", !enrollError, enrollError?.message);
  const secret = enrolled.totp.secret;
  const { error: verifyError } = await s1.auth.mfa.challengeAndVerify({
    factorId: enrolled.id,
    code: totp(secret),
  });
  check("the first code turns it on", !verifyError, verifyError?.message);

  const s2 = client();
  await s2.auth.signInWithPassword({ email, password });
  const { data: level } = await s2.auth.mfa.getAuthenticatorAssuranceLevel();
  check(
    "a new sign-in asks for the code",
    level.currentLevel === "aal1" && level.nextLevel === "aal2",
  );
  check("with only the password the hotel's data is hidden", (await reservations(s2)) === 0);
  // Inviting themselves: 409 "already in the team" when allowed, 403 when not.
  const inviteSelf = async (c) =>
    (
      await fetch(`${SUPABASE_URL}/functions/v1/staff-invite`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${(await c.auth.getSession()).data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tenant_id: tenant.id, email, role: "reception" }),
      })
    ).status;
  const refused = await inviteSelf(s2);
  check("and functions that check roles refuse it too", refused === 403, `HTTP ${refused}`);

  const { data: factors } = await s2.auth.mfa.listFactors();
  const { error: codeError } = await s2.auth.mfa.challengeAndVerify({
    factorId: factors.totp[0].id,
    code: totp(secret),
  });
  check("the code verifies the session", !codeError, codeError?.message);
  check("with the code the hotel's data is back", (await reservations(s2)) > 0);
  const allowed = await inviteSelf(s2);
  check("and the functions accept it", allowed === 409, `HTTP ${allowed}`);
} catch (e) {
  check("no unexpected error", false, e.message);
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId);
  console.log("Temporary user deleted.");
}
process.exit(failures ? 1 : 0);
