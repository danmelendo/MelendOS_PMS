import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";

/**
 * group = group management: both hotels, management only (no bookings).
 * platform = "Administrador": Melend/OS support, full control of every hotel.
 */
export type AppRole = "admin" | "reception" | "group" | "platform";

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
  const platform = roles.includes("platform");
  return {
    roles,
    tenantIds: memberships.map((m) => m.tenant_id),
    // Group management has admin rights (it is the highest role)…
    isAdmin: platform || roles.includes("admin") || roles.includes("group"),
    isReception: platform || roles.includes("reception") || roles.includes("admin"),
    isGroup: roles.includes("group"),
    isPlatform: platform,
    // …but does not run the hotels: bookings, check-ins, bills, messages.
    canOperate: platform || roles.includes("admin") || roles.includes("reception"),
    // Guests' messages are answered by reception only (management reads them).
    // (and Melend/OS support, which can do everything).
    canMessage: platform || roles.includes("reception"),
    isStaff: memberships.length > 0,
    loading: q.isLoading,
  };
}
