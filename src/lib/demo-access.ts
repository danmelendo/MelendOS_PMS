import { DEMO_ACCOUNTS, type DemoAccount } from "@shared/demo/accounts.ts";
import { supabase } from "@/integrations/supabase/client";

// Demo access: pick a fictitious account from a list instead of signing in.
// Only when the build sets VITE_DEMO_ACCESS=true (and the project the
// DEMO_ACCESS secret for the demo-login function): the demo / pre-production
// environment. Production uses the normal sign-in form.
export const DEMO_ACCESS = import.meta.env.VITE_DEMO_ACCESS === "true";

export const demoAccounts = (kind: DemoAccount["kind"]) =>
  DEMO_ACCOUNTS.filter((a) => a.kind === kind);

export async function demoSignIn(email: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("demo-login", { body: { email } });
  if (error || !data?.token_hash)
    throw new Error("No se pudo entrar con la cuenta de demostración");
  const { error: otpError } = await supabase.auth.verifyOtp({
    token_hash: data.token_hash,
    type: "email",
  });
  if (otpError) throw new Error(otpError.message);
}
