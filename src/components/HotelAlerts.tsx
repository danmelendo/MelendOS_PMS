import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { HOTEL_ALERT_KINDS, isHotelAlertKind } from "@domain/hotel-alerts.ts";
import { supabase } from "@/integrations/supabase/client";
import { t } from "@/lib/i18n";

// What the hotel has to fix itself (hotel_alerts): traveller reports missing
// data, invoices the AEAT rejected, guest emails that bounced, a channel
// refusing updates. Each line links to the page where it is fixed. The same
// wording goes by email to management (hotel_alert_notices).
export function HotelAlerts() {
  const { data: alerts } = useQuery({
    queryKey: ["hotel_alerts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("hotel_alerts");
      if (error) throw error;
      return (data ?? []).filter((a) => isHotelAlertKind(a.kind));
    },
    refetchInterval: 5 * 60_000,
  });

  if (!alerts?.length) return null;
  const hotels = new Set(alerts.map((a) => a.tenant_id)).size;

  return (
    <div className="rounded-lg border border-gold/50 bg-gold/10 p-3 text-sm" role="status">
      <p className="mb-1.5 flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 text-gold" /> {t("Necesita tu atención")}
      </p>
      <ul className="space-y-1">
        {alerts.map((a) => {
          const k = HOTEL_ALERT_KINDS[a.kind];
          return (
            <li key={`${a.tenant_id}-${a.kind}`}>
              <Link
                to={k.path}
                className="group flex flex-wrap items-center gap-x-2 rounded px-1 py-0.5 hover:bg-gold/15"
              >
                <span className="font-medium">{t(k.area)}</span>
                {hotels > 1 && <span className="text-muted-foreground">· {a.hotel}</span>}
                <span>
                  · {a.items} {t(Number(a.items) === 1 ? k.one : k.many)}
                </span>
                <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
