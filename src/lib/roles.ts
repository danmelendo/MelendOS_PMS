import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";

/** group = group management: both hotels, management only (no bookings). */
export type AppRole = "admin" | "reception" | "group";

/** The signed-in staff member's roles, across the hotels (tenants) they belong to. */
export function useRoles() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["tenant_members", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_members")
        .select("tenant_id, role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const memberships = q.data ?? [];
  const roles = [...new Set(memberships.map((m) => m.role as AppRole))];
  return {
    roles,
    tenantIds: memberships.map((m) => m.tenant_id),
    // Group management has admin rights (it is the highest role)…
    isAdmin: roles.includes("admin") || roles.includes("group"),
    isReception: roles.includes("reception") || roles.includes("admin"),
    isGroup: roles.includes("group"),
    // …but does not run the hotels: bookings, check-ins, bills, messages.
    canOperate: roles.includes("admin") || roles.includes("reception"),
    isStaff: memberships.length > 0,
    loading: q.isLoading,
  };
}
