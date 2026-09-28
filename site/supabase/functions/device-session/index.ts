// POST /device-session  (sales project; the admin panel, with the user's session)
// { device_id, timestamp, signature }
//   → { status: "trusted" | "pending" | "revoked" | "unknown", name? }
//
// The browser signs its Supabase session with its device key (private half
// not exportable). If the signature matches the device's public key and the
// device is approved, the session becomes trusted for 12 hours
// (sales_device_sessions) and is_sales_admin() lets its requests through.
import { createClient } from "npm:@supabase/supabase-js@2";
import { deviceMessage, freshProof, verifyDeviceSignature } from "../_shared/device.ts";

const TRUST_HOURS = 12;

// Browsers that may call it: the site's origins (SITE_ORIGIN, comma separated).
const ORIGINS = (Deno.env.get("SITE_ORIGIN") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : (ORIGINS[0] ?? ""),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

/** The session id of a JWT already validated by getUser(). */
function sessionOf(jwt: string): string | null {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const headers = cors(req);
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: auth } = await db.auth.getUser(jwt);
  const session = auth.user ? sessionOf(jwt) : null;
  if (!auth.user || !session) return reply({ error: "Sesión no válida" }, 401);

  const { data: account } = await db
    .from("sales_admins")
    .select("user_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!account) return reply({ error: "Sin acceso al panel" }, 403);

  let body: { device_id?: string; timestamp?: number; signature?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "JSON no válido" }, 400);
  }
  const { data: device } = await db
    .from("sales_devices")
    .select("id, name, public_key, approved_at, revoked_at")
    .eq("id", body.device_id ?? "")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!device) return reply({ status: "unknown" });
  if (device.revoked_at) return reply({ status: "revoked", name: device.name });

  const ts = Number(body.timestamp);
  const ok =
    freshProof(ts) &&
    typeof body.signature === "string" &&
    (await verifyDeviceSignature(device.public_key, deviceMessage(session, ts), body.signature));
  if (!ok) return reply({ error: "Firma del equipo no válida" }, 401);

  await db.from("sales_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
  if (!device.approved_at) return reply({ status: "pending", name: device.name });

  const { error } = await db.from("sales_device_sessions").upsert({
    session_id: session,
    device_id: device.id,
    user_id: auth.user.id,
    expires_at: new Date(Date.now() + TRUST_HOURS * 3600_000).toISOString(),
  });
  if (error) {
    console.error(`device-session: ${error.message}`);
    return reply({ error: "No se pudo registrar la sesión" }, 500);
  }
  return reply({ status: "trusted", name: device.name });
});
