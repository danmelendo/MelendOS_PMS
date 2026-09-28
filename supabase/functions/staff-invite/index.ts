// POST /staff-invite  { tenant_id, email, role: "admin" | "reception" }
//
// Management of a hotel adds someone to its team (Admin → Equipo). A new
// email gets an invitation to choose a password (/reset-password); an account
// that already exists (e.g. staff of another hotel of the group) is just added.
// In the demo (DEMO_ACCESS=true) no email is sent: the account is created
// without one, since the demo's visitors are all management.
// Caller: management of that hotel (Authorization: Bearer <user JWT>).
import { adminClient, corsHeaders, json } from "../_shared/http.ts";

const ROLES = ["admin", "reception"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { tenant_id?: string; email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const role = ROLES.find((r) => r === body.role);
  if (!body.tenant_id || !role || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return json({ error: "Indica un email válido y el rol (dirección o recepción)" }, 400);
  }

  const db = adminClient();
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: auth } = jwt.split(".").length === 3 ? await db.auth.getUser(jwt) : { data: null };
  const callerId = auth?.user?.id;
  const { data: caller } = callerId
    ? await db
        .from("tenant_members")
        .select("role")
        .eq("tenant_id", body.tenant_id)
        .eq("user_id", callerId)
        .maybeSingle()
    : { data: null };
  if (caller?.role !== "admin" && caller?.role !== "group") {
    return json({ error: "Solo la dirección del hotel puede invitar al equipo" }, 403);
  }

  const demo = Deno.env.get("DEMO_ACCESS") === "true";
  const origin = req.headers.get("Origin");
  const appUrl =
    origin && /^https?:\/\/[^/]+$/.test(origin)
      ? origin
      : (Deno.env.get("PUBLIC_WEB_URL") ?? "https://demostays.example");

  let userId = (await db.rpc("auth_user_id", { p_email: email })).data as string | null;
  let invited = false;
  if (!userId) {
    const created = demo
      ? await db.auth.admin.createUser({ email, email_confirm: true })
      : await db.auth.admin.inviteUserByEmail(email, { redirectTo: `${appUrl}/reset-password` });
    if (created.error || !created.data.user) {
      console.error(`staff-invite: ${created.error?.message}`);
      return json({ error: "No se pudo crear la invitación" }, 502);
    }
    userId = created.data.user.id;
    invited = !demo;
  }

  const { error } = await db
    .from("tenant_members")
    .insert({ tenant_id: body.tenant_id, user_id: userId, role });
  if (error) {
    if (error.code === "23505") return json({ error: "Ya forma parte del equipo" }, 409);
    console.error(`staff-invite: ${error.message}`);
    return json({ error: "No se pudo añadir al equipo" }, 500);
  }
  await db.from("domain_events").insert({
    tenant_id: body.tenant_id,
    event_type: "staff.added",
    entity: "tenant_member",
    entity_id: userId,
    actor_id: callerId,
    payload: { role, invited },
  });
  return json({ user_id: userId, invited, demo });
});
