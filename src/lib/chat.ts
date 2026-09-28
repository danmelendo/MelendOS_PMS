import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

// Chat between the guest and reception, one conversation per booking. Guests
// go through get_stay_messages / send_stay_message (booking token or account);
// reception reads and writes the stay_messages table under RLS.

export type Sender = "guest" | "staff" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  sender: Sender;
  body: string;
  category: string | null;
  created_at: string;
  read_at: string | null;
}

/** Quick requests: a tagged message instead of a form. */
export const QUICK_REQUESTS = [
  { category: "towels", label: "Toallas", text: "¿Podrían subirme toallas limpias, por favor?" },
  {
    category: "housekeeping",
    label: "Limpieza de habitación",
    text: "¿Pueden hacer la habitación hoy?",
  },
  { category: "room_service", label: "Room service", text: "Quisiera pedir room service." },
  {
    category: "maintenance",
    label: "Algo no funciona",
    text: "Hay algo en la habitación que no funciona:",
  },
  { category: "valet", label: "Mi coche", text: "¿Podrían traerme el coche a la entrada?" },
  { category: "early_checkin", label: "Early check-in", text: "Me gustaría hacer early check-in." },
  { category: "late_checkout", label: "Late checkout", text: "Me gustaría hacer late checkout." },
] as const;

export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  QUICK_REQUESTS.map((q) => [q.category, q.label]),
);

/** Stays whose conversation is open for the guest. */
export function chatOpen(status: string, checkOut: string) {
  if (["held", "confirmed", "in_progress"].includes(status)) return true;
  return status === "completed" && Date.now() - Date.parse(checkOut) < 3 * 86_400_000;
}

// ── Guest side ───────────────────────────────────────────────────────────────
export function useGuestChat(reservationId: string, token: string | null) {
  return useQuery({
    queryKey: ["chat", "guest", reservationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_stay_messages", {
        p_reservation_id: reservationId,
        p_token: token ?? undefined,
      });
      if (error) throw error;
      return (data as unknown as ChatMessage[]) ?? [];
    },
    refetchInterval: 4_000,
  });
}

export function useSendGuestMessage(reservationId: string, token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, category }: { body: string; category?: string }) => {
      const { error } = await supabase.rpc("send_stay_message", {
        p_reservation_id: reservationId,
        // null = signed-in member (the generated type marks it required).
        p_token: token as string,
        p_body: body,
        p_category: category,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "guest", reservationId] }),
  });
}

// ── Reception side ───────────────────────────────────────────────────────────
export interface InboxMessage extends ChatMessage {
  reservation_id: string;
  tenant_id: string;
}

/**
 * Live updates for the reception inbox (real backend). Mount it once: the
 * panel sidebar does, so every inbox query refreshes when a message arrives.
 */
export function useInboxLive(enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel("stay-messages")
      .on("postgres_changes", { event: "*", schema: "public", table: "stay_messages" }, () =>
        qc.invalidateQueries({ queryKey: ["chat"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, enabled]);
}

/** Recent messages of the staff member's hotels, newest first. */
export function useInbox(enabled = true) {
  return useQuery({
    queryKey: ["chat", "inbox"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stay_messages")
        .select("id, tenant_id, reservation_id, sender, body, category, created_at, read_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as InboxMessage[];
    },
    refetchInterval: 15_000,
  });
}

export function useUnreadCount(enabled = true) {
  const { data } = useInbox(enabled);
  return (data ?? []).filter((m) => m.sender === "guest" && !m.read_at).length;
}

export function useStaffReply() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (m: { tenantId: string; reservationId: string; body: string }) => {
      const { error } = await supabase.from("stay_messages").insert({
        tenant_id: m.tenantId,
        reservation_id: m.reservationId,
        sender: "staff",
        body: m.body,
        staff_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat"] }),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reservationId: string) => {
      const { error } = await supabase
        .from("stay_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("reservation_id", reservationId)
        .eq("sender", "guest")
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "inbox"] }),
  });
}
