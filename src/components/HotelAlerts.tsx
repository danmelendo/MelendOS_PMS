import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// What the hotel has to fix itself (hotel_alerts): traveller reports missing
// data, invoices the AEAT rejected, guest emails that bounced, a channel
// refusing updates. Each line links to the page where it is fixed.
const KINDS: Record<string, { area: string; one: string; many: string; path: string }> = {
  ses_blocked: {
    area: "Registro de viajeros",
    one: "parte sin enviar porque faltan datos de los viajeros",
    many: "partes sin enviar porque faltan datos de los viajeros",
    path: "/travellers",
  },
  ses_rejected: {
    area: "Registro de viajeros",
    one: "parte rechazado por el ministerio",
    many: "partes rechazados por el ministerio",
    path: "/travellers",
  },
  ses_error: {
    area: "Registro de viajeros",
    one: "parte que no se pudo enviar (revisa las credenciales)",
    many: "partes que no se pudieron enviar (revisa las credenciales)",
    path: "/travellers",
  },
  verifactu_rejected: {
    area: "Facturas",
    one: "registro rechazado por la AEAT (hay que subsanarlo)",
    many: "registros rechazados por la AEAT (hay que subsanarlos)",
    path: "/invoices",
  },
  email_failed: {
    area: "Emails al huésped",
    one: "email que no llegó (revisa el email del huésped)",
    many: "emails que no llegaron (revisa el email de los huéspedes)",
    path: "/reservations",
  },
  channel_error: {
    area: "Canales",
    one: "envío de disponibilidad rechazado por el canal",
    many: "envíos de disponibilidad rechazados por el canal",
    path: "/channels",
  },
};

export function HotelAlerts() {
  const { data: alerts } = useQuery({
    queryKey: ["hotel_alerts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("hotel_alerts");
      if (error) throw error;
      return (data ?? []).filter((a) => a.kind in KINDS);
    },
    refetchInterval: 5 * 60_000,
  });

  if (!alerts?.length) return null;
  const hotels = new Set(alerts.map((a) => a.tenant_id)).size;

  return (
    <div className="rounded-lg border border-gold/50 bg-gold/10 p-3 text-sm" role="status">
      <p className="mb-1.5 flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 text-gold" /> Necesita tu atención
      </p>
      <ul className="space-y-1">
        {alerts.map((a) => {
          const k = KINDS[a.kind];
          return (
            <li key={`${a.tenant_id}-${a.kind}`}>
              <Link
                to={k.path}
                className="group flex flex-wrap items-center gap-x-2 rounded px-1 py-0.5 hover:bg-gold/15"
              >
                <span className="font-medium">{k.area}</span>
                {hotels > 1 && <span className="text-muted-foreground">· {a.hotel}</span>}
                <span>
                  · {a.items} {Number(a.items) === 1 ? k.one : k.many}
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
