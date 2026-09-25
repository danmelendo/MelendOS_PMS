import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { pms } from "@/integrations/pms";
import type { Member } from "@/integrations/pms";
import { IS_DEMO, supabase } from "@/integrations/supabase/client";
import { DEMO_MEMBER_ID } from "@/integrations/demo/seed";
import { useAuth } from "./auth";
import { useBrand } from "./brand";

// Guest identity for the guest app (/stays).
// - Demo (no backend): the seeded member, switchable from the Account screen.
// - Real backend: the signed-in user's guest account in the active hotel
//   (members.user_id = auth user, one account per hotel). Without a session
//   the app asks the guest to sign in.
const KEY = "stays-member-id";

interface MemberCtx {
  memberId: string;
  member: Member | null;
  loading: boolean;
  /** Real backend only: nobody is signed in, or the user has no account here. */
  needsSignIn: boolean;
  setMemberId: (id: string) => void;
}

const Ctx = createContext<MemberCtx | null>(null);

function readMemberId(): string {
  if (typeof window === "undefined") return DEMO_MEMBER_ID;
  return window.localStorage.getItem(KEY) ?? DEMO_MEMBER_ID;
}

export function MemberProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { brandId } = useBrand();
  const [demoMemberId, setDemoMemberId] = useState<string>(readMemberId);

  useEffect(() => {
    if (IS_DEMO && typeof window !== "undefined") window.localStorage.setItem(KEY, demoMemberId);
  }, [demoMemberId]);

  // Real backend: the user's account in the hotel of the active brand.
  const { data: realMemberId, isLoading: resolving } = useQuery({
    queryKey: ["member-account", user?.id, brandId],
    enabled: !IS_DEMO && !!user,
    queryFn: async () => {
      const [{ data: accounts }, { data: hotels }] = await Promise.all([
        supabase.from("members").select("id, tenant_id").eq("user_id", user!.id),
        supabase.from("properties").select("tenant_id").eq("brand", brandId),
      ]);
      const tenants = new Set((hotels ?? []).map((h) => h.tenant_id));
      return (accounts ?? []).find((a) => tenants.has(a.tenant_id))?.id ?? null;
    },
  });

  const memberId = IS_DEMO ? demoMemberId : (realMemberId ?? "");

  const { data: member, isLoading } = useQuery({
    queryKey: ["pms", "member", memberId],
    enabled: !!memberId,
    queryFn: () => pms.getMember(memberId),
  });

  const loading = IS_DEMO ? isLoading : authLoading || resolving || (!!memberId && isLoading);

  return (
    <Ctx.Provider
      value={{
        memberId,
        member: member ?? null,
        loading,
        needsSignIn: !IS_DEMO && !loading && !memberId,
        setMemberId: setDemoMemberId,
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
