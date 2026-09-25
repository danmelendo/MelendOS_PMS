import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";

export type AppRole = "admin" | "reception" | "customer";

export function useRoles() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["user_roles", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<AppRole[]> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as AppRole);
    },
  });
  const roles = q.data ?? [];
  return {
    roles,
    isAdmin: roles.includes("admin"),
    isReception: roles.includes("reception") || roles.includes("admin"),
    loading: q.isLoading,
  };
}
