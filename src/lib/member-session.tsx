import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { pms } from "@/integrations/pms";
import type { Member } from "@/integrations/pms";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";
import { useBrand } from "./brand";

// Guest identity on the booking web ("Mi reserva"): the signed-in user's guest account
// in the active hotel (members.user_id = auth user, one account per hotel).
// Without a session the app asks the guest to sign in.

interface MemberCtx {
  memberId: string;
  member: Member | null;
  loading: boolean;
  /** Nobody is signed in, or the user has no account in this hotel. */
  needsSignIn: boolean;
}

const Ctx = createContext<MemberCtx | null>(null);

export function MemberProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { tenantId } = useBrand();

  // The user's account in the hotel of the active brand.
  const { data: accountId, isLoading: resolving } = useQuery({
    queryKey: ["member-account", user?.id, tenantId],
    enabled: !!user && !!tenantId,
    queryFn: async () => {
      const { data: accounts } = await supabase
        .from("members")
        .select("id, tenant_id")
        .eq("user_id", user!.id)
        .eq("tenant_id", tenantId!);
      return accounts?.[0]?.id ?? null;
    },
  });

  const memberId = accountId ?? "";

  const { data: member, isLoading } = useQuery({
    queryKey: ["pms", "member", memberId],
    enabled: !!memberId,
    queryFn: () => pms.getMember(memberId),
  });

  const loading = authLoading || resolving || (!!memberId && isLoading);

  return (
    <Ctx.Provider
      value={{
        memberId,
        member: member ?? null,
        loading,
        needsSignIn: !loading && !memberId,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useMember() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMember must be used inside MemberProvider");
  return c;
}
