import { DEMO_ACCOUNTS, type DemoAccount } from "@shared/demo/accounts.ts";
import { IS_DEMO, supabase } from "@/integrations/supabase/client";

// Demo access: pick a fictitious account from a list instead of signing in.
// On by default in the backend-free mock; on the real backend only when the
// build sets VITE_DEMO_ACCESS=true (and the project the DEMO_ACCESS secret for
// the demo-login function). Production uses the normal sign-in form.
export const DEMO_ACCESS = IS_DEMO || import.meta.env.VITE_DEMO_ACCESS === "true";

export const demoAccounts = (kind: DemoAccount["kind"]) =>
  DEMO_ACCOUNTS.filter((a) => a.kind === kind);

export async function demoSignIn(email: string): Promise<void> {
  if (IS_DEMO) {
    // The mock accepts any sign-in.
    const { error } = await supabase.auth.signInWithPassword({ email, password: "demo" });
    if (error) throw new Error(error.message);
    return;
  }
  const { data, error } = await supabase.functions.invoke("demo-login", { body: { email } });
  if (error || !data?.token_hash)
    throw new Error("No se pudo entrar con la cuenta de demostración");
  const { error: otpError } = await supabase.auth.verifyOtp({
    token_hash: data.token_hash,
    type: "email",
  });
  if (otpError) throw new Error(otpError.message);
}
