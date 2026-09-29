// Gives (or takes away) the "Administrador" role: Melend/OS support with full
// control of every hotel, present and future. The account must exist (invite
// it first or sign up through a hotel's team page). Platform only: service key.
// Usage: node --env-file=.env scripts/platform-admin.mjs <email> [--remove] [--note "Dan"]
//        node --env-file=.env scripts/platform-admin.mjs --list
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => (flag(name) ? args[args.indexOf(name) + 1] : null);

if (flag("--list")) {
  const { data, error } = await db.from("platform_admins").select("user_id, note, created_at");
  if (error) throw error;
  for (const a of data) {
    const { data: u } = await db.auth.admin.getUserById(a.user_id);
    console.log(
      `${u?.user?.email ?? a.user_id}  ${a.note ?? ""}  desde ${a.created_at.slice(0, 10)}`,
    );
  }
  if (!data.length) console.log("Nadie tiene el rol de administrador.");
  process.exit(0);
}

const email = args.find((a) => a.includes("@"));
if (!email) {
  console.error("Uso: platform-admin.mjs <email> [--remove] [--note texto] | --list");
  process.exit(2);
}
const { data: userId, error: findError } = await db.rpc("auth_user_id", { p_email: email });
if (findError) throw findError;
if (!userId) {
  console.error(`No hay ninguna cuenta con ${email}. Créala antes (invitación desde «Equipo»).`);
  process.exit(1);
}

if (flag("--remove")) {
  const { error } = await db.from("platform_admins").delete().eq("user_id", userId);
  if (error) throw error;
  console.log(`${email} ya no es administrador (se quita de todos los hoteles).`);
} else {
  const { error } = await db
    .from("platform_admins")
    .upsert({ user_id: userId, note: value("--note") }, { onConflict: "user_id" });
  if (error) throw error;
  const { count } = await db
    .from("tenant_members")
    .select("tenant_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "platform");
  console.log(`${email} es administrador en ${count} hoteles (y en los que se den de alta).`);
}
