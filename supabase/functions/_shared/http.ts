// Small HTTP helpers shared by the Edge Functions.
import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tenant-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Service-role client: bypasses RLS, so every query must scope by tenant. */
export function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing Supabase environment");
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * The staff member behind a user JWT, for functions that check roles with the
 * service key. Like auth.getUser, but someone with two-step verification on
 * only counts with a session verified with the code (aal2), as in the
 * database (staff_mfa_ok).
 */
export async function verifiedUser(db: ReturnType<typeof adminClient>, jwt: string) {
  const { data } = await db.auth.getUser(jwt);
  const user = data.user;
  if (!user) return { data: { user: null } };
  const hasFactor = (user.factors ?? []).some((f) => f.status === "verified");
  if (!hasFactor) return { data: { user } };
  let aal: unknown = null;
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    aal = (JSON.parse(atob(part)) as { aal?: unknown }).aal;
  } catch {
    /* unreadable: not verified */
  }
  return { data: { user: aal === "aal2" ? user : null } };
}
