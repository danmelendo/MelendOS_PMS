// Smoke test through the public Data API with the publishable key, the same way
// the browser talks to Supabase. Usage: node --env-file=.env scripts/smoke-api.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const password = process.env.DEMO_USERS_PASSWORD ?? "DemoStays!2026";
const fresh = () => createClient(url, key, { auth: { persistSession: false } });

const anon = fresh();
const rooms = await anon.from("rooms").select("id", { count: "exact", head: true });
const res = await anon.from("reservations").select("id", { count: "exact", head: true });
console.log(`anon       rooms=${rooms.count} reservations=${res.count}`);

for (const email of [
  "recepcion@lumen.demostays.example",
  "admin@albora.demostays.example",
  "alex@guest.demostays.example",
]) {
  const c = fresh();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const { data } = await c.from("reservations").select("tenant_id, tenants(slug)");
  const byTenant = {};
  for (const r of data ?? [])
    byTenant[r.tenants?.slug ?? r.tenant_id] = (byTenant[r.tenants?.slug ?? r.tenant_id] ?? 0) + 1;
  console.log(`${email.padEnd(36)} reservations=${JSON.stringify(byTenant)}`);
}
