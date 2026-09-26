import { useQuery } from "@tanstack/react-query";
import { addDays, ymdInZone, type Ymd } from "@domain/dates.ts";
import type { StayFact } from "@domain/kpis.ts";
import { IS_DEMO, supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/lib/roles";

// Data for the dashboards: stay facts from the report_stays function (the mock
// emulates it), turned into KPIs by the shared code in @domain/kpis.ts.

export const HOTEL_TZ = "Europe/Madrid";

export interface StayFacts {
  /** Active rooms per hotel (tenant id → rooms). */
  rooms: Record<string, number>;
  stays: StayFact[];
}

type Raw = { rooms: Record<string, number>; stays: unknown[][] };

function parse(raw: Raw): StayFacts {
  return {
    rooms: raw.rooms ?? {},
    stays: (raw.stays ?? []).map((s) => ({
      tenantId: String(s[0]),
      roomId: String(s[1]),
      checkIn: String(s[2]),
      checkOut: String(s[3]),
      created: String(s[4]),
      cancelled: s[5] == null ? null : String(s[5]),
      status: String(s[6]),
      channel: s[7] == null ? null : String(s[7]),
      guests: Number(s[8]),
      roomRevenue: Number(s[9]),
    })),
  };
}

export function useStayFacts(from: Ymd, to: Ymd) {
  return useQuery({
    queryKey: ["reports", "stays", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_stays", { p_from: from, p_to: to });
      if (error) throw error;
      return parse(data as unknown as Raw);
    },
    staleTime: 60_000,
  });
}

/** Hotels the signed-in staff member can report on. */
export function useStaffHotels() {
  const { tenantIds, loading } = useRoles();
  return useQuery({
    queryKey: ["reports", "hotels", tenantIds],
    enabled: IS_DEMO || !loading,
    queryFn: async () => {
      let q = supabase.from("tenants").select("id, name").order("name");
      if (!IS_DEMO) q = q.in("id", tenantIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
}

export const PERIODS = {
  "30d": "Últimos 30 días",
  "90d": "Últimos 90 días",
  "12m": "Últimos 12 meses",
  ytd: "Este año",
  ahead: "Próximos 90 días (en cartera)",
} as const;
export type Period = keyof typeof PERIODS;

/** Period dates, plus the same weekdays one year earlier for comparison. */
export function periodRange(period: Period, now = new Date()) {
  const today = ymdInZone(now, HOTEL_TZ);
  const [from, to] =
    period === "30d"
      ? [addDays(today, -29), today]
      : period === "90d"
        ? [addDays(today, -89), today]
        : period === "12m"
          ? [addDays(today, -364), today]
          : period === "ytd"
            ? [`${today.slice(0, 4)}-01-01`, today]
            : [today, addDays(today, 89)];
  return { today, from, to, lyFrom: addDays(from, -364), lyTo: addDays(to, -364) };
}

export const CHANNELS: Record<string, string> = {
  public: "Web directa",
  admin: "Recepción / teléfono",
  staff: "Recepción / teléfono",
  reception: "Recepción / teléfono",
  agent: "Asistente IA",
  mcp: "Integración IA (MCP)",
  member: "Club (app)",
  other: "Otros",
};
