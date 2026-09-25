// POST /demo-login  { email }
//
// Demo only: opens a session for one of the fictitious demo accounts without a
// password, so a visitor picks "Reception · Hotel Lumen" from a list instead
// of typing credentials. Returns a one-time token hash that the browser
// exchanges with supabase.auth.verifyOtp.
//
// Disabled unless the project sets the DEMO_ACCESS=true secret; production
// never does, and then this answers 404 like a missing function.
import { adminClient, corsHeaders, json } from "../_shared/http.ts";
import { isDemoAccount } from "../_shared/demo/accounts.ts";

Deno.serve(async (req) => {
  if (Deno.env.get("DEMO_ACCESS") !== "true") return json({ error: "Not found" }, 404);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let email = "";
  try {
    email = String((await req.json()).email ?? "")
      .trim()
      .toLowerCase();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isDemoAccount(email)) return json({ error: "Not a demo account" }, 403);

  const { data, error } = await adminClient().auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data.properties?.hashed_token) {
    console.error(`demo-login failed: ${error?.message}`);
    return json({ error: "Could not open the session" }, 500);
  }
  return json({ token_hash: data.properties.hashed_token });
});
