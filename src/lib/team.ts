import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// The hotel's team (Admin → Equipo). Reading goes through list_staff (emails
// live in auth.users); roles and removals are tenant_members rows (RLS: only
// management; a trigger keeps at least one admin and leaves "group" alone).

export type StaffRole = "admin" | "reception" | "group";

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Dirección",
  reception: "Recepción",
  group: "Dirección de grupo",
};

export interface StaffMember {
  user_id: string;
  email: string;
  role: StaffRole;
  created_at: string;
  last_sign_in_at: string | null;
}

export function useStaff(tenantId: string | null) {
  return useQuery({
    queryKey: ["staff", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<StaffMember[]> => {
      const { data, error } = await supabase.rpc("list_staff", { p_tenant: tenantId! });
      if (error) throw new Error(error.message);
      return (data ?? []) as StaffMember[];
    },
  });
}

async function functionError(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  try {
    const body = ctx ? await ctx.json() : null;
    if (body?.error) return String(body.error);
  } catch {
    /* not JSON */
  }
  return fallback;
}

export function useTeamActions(tenantId: string | null) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["staff", tenantId] });
  return {
    invite: useMutation({
      mutationFn: async (v: { email: string; role: "admin" | "reception" }) => {
        const { data, error } = await supabase.functions.invoke("staff-invite", {
          body: { tenant_id: tenantId, ...v },
        });
        if (error) throw new Error(await functionError(error, "No se pudo invitar"));
        return data as { invited: boolean; demo: boolean };
      },
      onSettled: refresh,
    }),
    setRole: useMutation({
      mutationFn: async (v: { userId: string; role: "admin" | "reception" }) => {
        const { error } = await supabase
          .from("tenant_members")
          .update({ role: v.role })
          .eq("tenant_id", tenantId!)
          .eq("user_id", v.userId);
        if (error) throw new Error(error.message);
      },
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: async (userId: string) => {
        const { error, count } = await supabase
          .from("tenant_members")
          .delete({ count: "exact" })
          .eq("tenant_id", tenantId!)
          .eq("user_id", userId);
        if (error) throw new Error(error.message);
        if (!count) throw new Error("No se pudo quitar del equipo");
      },
      onSettled: refresh,
    }),
  };
}
