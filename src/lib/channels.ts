import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FUNCTIONS_URL, supabase } from "@/integrations/supabase/client";

// Distribution channels (OTAs, channel managers, tour operators): set-up and
// follow-up for the panel. Bookings come in through channel-webhook; the
// availability goes out through channels-dispatch (docs/channels.md).

export const CHANNEL_KINDS = {
  ota: "OTA",
  channel_manager: "Channel manager",
  tour_operator: "Touroperador",
} as const;
export type ChannelKind = keyof typeof CHANNEL_KINDS;

export const CHANNEL_PROVIDERS = {
  booking_com: "Booking.com",
  expedia: "Expedia",
  airbnb: "Airbnb",
  hotelbeds: "Hotelbeds",
  siteminder: "SiteMinder",
  channex: "Channex",
  demo: "Canal de pruebas",
  other: "Otro",
} as const;
export type ChannelProvider = keyof typeof CHANNEL_PROVIDERS;

export interface Channel {
  id: string;
  tenant_id: string;
  kind: ChannelKind;
  provider: ChannelProvider;
  name: string;
  status: "active" | "paused";
  commission_pct: number;
  room_map: Record<string, string>;
  created_at: string;
  last_message_at: string | null;
}

export interface ChannelMessage {
  id: number;
  channel_id: string;
  direction: "in" | "out";
  event: string;
  external_ref: string | null;
  reservation_id: string | null;
  status: "ok" | "error";
  detail: string | null;
  created_at: string;
}

export const webhookUrl = (channelId: string) =>
  `${FUNCTIONS_URL}/channel-webhook?channel=${channelId}`;

export function useChannels(tenantId: string | null) {
  return useQuery({
    queryKey: ["channels", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Channel[];
    },
  });
}

export function useChannelActivity(tenantId: string | null) {
  return useQuery({
    queryKey: ["channels", "activity", tenantId],
    enabled: !!tenantId,
    refetchInterval: 15_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [messages, pending, bookings] = await Promise.all([
        supabase
          .from("channel_messages")
          .select(
            "id, channel_id, direction, event, external_ref, reservation_id, status, detail, created_at",
          )
          .eq("tenant_id", tenantId!)
          .order("id", { ascending: false })
          .limit(50),
        supabase
          .from("channel_outbox")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId!)
          .eq("status", "pending"),
        supabase
          .from("reservations")
          .select("channel_id, total, channel_commission, status")
          .eq("tenant_id", tenantId!)
          .not("channel_id", "is", null)
          .gte("created_at", since),
      ]);
      if (messages.error) throw new Error(messages.error.message);
      const perChannel: Record<string, { bookings: number; revenue: number; commission: number }> =
        {};
      for (const b of bookings.data ?? []) {
        if (b.status === "cancelled") continue;
        const acc = (perChannel[b.channel_id!] ??= { bookings: 0, revenue: 0, commission: 0 });
        acc.bookings += 1;
        acc.revenue += Number(b.total);
        acc.commission += Number(b.channel_commission ?? 0);
      }
      return {
        messages: (messages.data ?? []) as ChannelMessage[],
        pending: pending.count ?? 0,
        perChannel,
      };
    },
  });
}

export function useChannelActions(tenantId: string | null) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["channels"] });
  const fail = async (error: unknown, fallback: string) => {
    try {
      const body = await (error as { context?: Response })?.context?.json();
      if (body?.error) return new Error(body.error);
    } catch {
      /* fall back */
    }
    return new Error((error as Error)?.message || fallback);
  };
  return {
    create: useMutation({
      mutationFn: async (v: {
        kind: ChannelKind;
        provider: ChannelProvider;
        name: string;
        commission: number;
        roomMap: Record<string, string>;
      }) => {
        const { data, error } = await supabase.rpc("create_channel", {
          p_tenant: tenantId!,
          p_kind: v.kind,
          p_provider: v.provider,
          p_name: v.name,
          p_commission: v.commission,
          p_room_map: v.roomMap,
        });
        if (error) throw new Error(error.message);
        return data as unknown as { id: string; secret: string };
      },
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: async (v: {
        id: string;
        patch: Partial<Pick<Channel, "status" | "commission_pct" | "room_map">>;
      }) => {
        const { error } = await supabase.from("channels").update(v.patch).eq("id", v.id);
        if (error) throw new Error(error.message);
      },
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.rpc("delete_channel", { p_channel: id });
        if (error) throw new Error(error.message);
      },
      onSuccess: refresh,
    }),
    dispatch: useMutation({
      mutationFn: async () => {
        const { data, error } = await supabase.functions.invoke("channels-dispatch", {
          body: { tenant_id: tenantId },
        });
        if (error) throw await fail(error, "No se pudo enviar la disponibilidad");
        return data as { processed: number; sent: number; failed: number };
      },
      onSuccess: refresh,
    }),
    simulate: useMutation({
      mutationFn: async (channelId: string) => {
        const { data, error } = await supabase.functions.invoke("channel-simulate", {
          body: { channel_id: channelId },
        });
        if (error) throw await fail(error, "No se pudo simular la reserva");
        return data as {
          status: number;
          response: { result?: string; reference?: string; error?: string };
        };
      },
      onSuccess: () => {
        refresh();
        qc.invalidateQueries({ queryKey: ["reservations"] });
      },
    }),
  };
}
