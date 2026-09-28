import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Two-step verification (TOTP app: Google Authenticator, 1Password…). Once a
// person turns it on, the database only honours their hotel rights with a
// session verified with the code (aal2), so the panel asks for it after the
// password (see supabase/migrations/*_staff_mfa.sql).

export function useAssurance(enabled = true) {
  return useQuery({
    queryKey: ["mfa", "aal"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      return {
        current: data.currentLevel,
        next: data.nextLevel,
        /** Has a second factor and this session has not used it yet. */
        needsCode: data.nextLevel === "aal2" && data.currentLevel !== "aal2",
      };
    },
    staleTime: 30_000,
  });
}

export function useFactors() {
  return useQuery({
    queryKey: ["mfa", "factors"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return data.totp;
    },
  });
}

export function useRefreshMfa() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["mfa"] });
    // Rights change with the session's level: reload everything.
    qc.invalidateQueries();
  };
}

/** Verifies the 6-digit code of the person's TOTP factor for this session. */
export async function verifyCode(code: string): Promise<string | null> {
  const { data: factors, error } = await supabase.auth.mfa.listFactors();
  if (error) return error.message;
  const factor = factors.totp.find((f) => f.status === "verified");
  if (!factor) return "No tienes la verificación en dos pasos activada";
  const { error: e } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: code.replace(/\s/g, ""),
  });
  return e ? "Código incorrecto o caducado" : null;
}
