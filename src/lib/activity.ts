import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Activity and consumption of a hotel (hotel_activity): AI usage, MCP calls,
// sending queues, storage and the latest errors.

export interface AiUsage {
  channel: string;
  turns: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  p50_ms: number | null;
  p95_ms: number | null;
  errors: number;
}

export interface HotelActivity {
  since: string;
  ai: AiUsage[];
  mcp_calls: number;
  queues: Record<"ses" | "verifactu" | "emails" | "channels", Record<string, number>>;
  storage: { lake_bytes: number; media_bytes: number };
  errors: { source: string; at: string; message: string }[];
}

export function useHotelActivity(tenantId: string | null, days: number) {
  return useQuery({
    queryKey: ["hotel-activity", tenantId, days],
    enabled: !!tenantId,
    queryFn: async (): Promise<HotelActivity> => {
      const { data, error } = await supabase.rpc("hotel_activity", {
        p_tenant: tenantId!,
        p_days: days,
      });
      if (error) throw new Error(error.message);
      return data as unknown as HotelActivity;
    },
  });
}

export const CHANNEL_LABELS: Record<string, string> = {
  web_chat: "Asistente de reservas (web)",
  admin_copilot: "Copiloto del panel",
  mcp: "Integraciones (MCP)",
  eval: "Evaluaciones",
};

/** Queue states that need someone to look at them. */
export const ATTENTION = new Set([
  "blocked",
  "rejected",
  "error",
  "failed",
  "accepted_with_errors",
]);

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
