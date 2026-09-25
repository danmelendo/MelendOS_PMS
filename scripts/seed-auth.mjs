// Creates the demo's auth users and links them to their hotels. Idempotent.
// Needs SUPABASE_URL and SUPABASE_SECRET_KEY (server-side key).
// Usage: node --env-file=.env scripts/seed-auth.mjs
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { DEMO_ACCOUNTS } from "../supabase/functions/_shared/demo/accounts.ts";

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");
  process.exit(1);
}
const password = process.env.DEMO_USERS_PASSWORD ?? "DemoStays!2026";

// Same deterministic ids as supabase/seed.sql: md5(key) as a uuid.
const sid = (k) => {
  const h = createHash("md5").update(k).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

const admin = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Accounts come from the shared list (also used by demo-login and the picker).
const STAFF = DEMO_ACCOUNTS.filter((a) => a.kind === "staff");
const GUEST = {
  email: DEMO_ACCOUNTS.find((a) => a.kind === "guest").email,
  members: ["lumen-member-alex", "albora-member-alex"],
};

async function ensureUser(email) {
  // listUsers is paginated; the demo has a handful of users.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  const found = data.users.find((u) => u.email === email);
  if (found) return found.id;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  return created.data.user.id;
}

for (const s of STAFF) {
  const userId = await ensureUser(s.email);
  const { error } = await admin
    .from("tenant_members")
    .upsert(
      { tenant_id: sid(s.tenant), user_id: userId, role: s.role },
      { onConflict: "tenant_id,user_id" },
    );
  if (error) throw error;
  console.log(`staff  ${s.role.padEnd(9)} ${s.email}`);
}

const guestId = await ensureUser(GUEST.email);
for (const m of GUEST.members) {
  const { error } = await admin.from("members").update({ user_id: guestId }).eq("id", sid(m));
  if (error) throw error;
}
console.log(`guest  member    ${GUEST.email}`);

// Payment gateway secrets in Vault (test environment only). The Redsys test key
// comes from the environment so it never lives in the repository.
const redsysKey = process.env.REDSYS_TEST_SECRET_KEY;
if (redsysKey) {
  for (const name of ["payments/lumen/redsys", "payments/albora/redsys"]) {
    const { error } = await admin.rpc("upsert_payment_secret", {
      p_name: name,
      p_secret: redsysKey,
    });
    if (error) throw error;
  }
  console.log("vault  redsys    test key stored for both hotels");
} else {
  console.log("vault  redsys    REDSYS_TEST_SECRET_KEY not set; payment secrets not stored");
}
console.log(`\nPassword for all demo users: ${password}`);
