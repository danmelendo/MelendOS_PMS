import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { pms } from "@/integrations/pms";
import type { Member } from "@/integrations/pms";

// Guest identity for the guest app (/stays). This is intentionally
// separate from the staff auth (src/lib/auth.tsx): the mobile product signs in a
// loyalty member, not a reception/admin user. For the demo it defaults to the
// seeded member and can be switched from the Account screen — a real build would
// back this with the member's own auth.
const DEFAULT_MEMBER_ID = "member-demo-alex";
const KEY = "stays-member-id";

interface MemberCtx {
  memberId: string;
  member: Member | null;
  loading: boolean;
  setMemberId: (id: string) => void;
}

const Ctx = createContext<MemberCtx | null>(null);

function readMemberId(): string {
  if (typeof window === "undefined") return DEFAULT_MEMBER_ID;
  return window.localStorage.getItem(KEY) ?? DEFAULT_MEMBER_ID;
}

export function MemberProvider({ children }: { children: ReactNode }) {
  const [memberId, setMemberIdState] = useState<string>(readMemberId);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, memberId);
  }, [memberId]);

  const { data: member, isLoading } = useQuery({
    queryKey: ["pms", "member", memberId],
    queryFn: () => pms.getMember(memberId),
  });

  return (
    <Ctx.Provider
      value={{
        memberId,
        member: member ?? null,
        loading: isLoading,
        setMemberId: setMemberIdState,
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
