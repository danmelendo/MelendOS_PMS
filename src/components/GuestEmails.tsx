import { useQuery } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Emails sent to the guest about this booking (confirmation, cancellation),
// queued by the database and sent by guest-emails-dispatch.

const KIND: Record<string, string> = {
  booking_confirmed: "Confirmación",
  booking_cancelled: "Cancelación",
};
const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "en cola", className: "text-muted-foreground" },
  sent: { label: "enviado", className: "text-emerald-700" },
  simulated: { label: "simulado (demo, no sale)", className: "text-info" },
  skipped: { label: "sin email del huésped", className: "text-muted-foreground" },
  failed: { label: "error", className: "text-destructive" },
};

interface GuestEmailRow {
  id: string;
  kind: string;
  status: string;
  to_email: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
}

export function GuestEmails({ reservationId }: { reservationId: string }) {
  const { data } = useQuery({
    queryKey: ["guest-emails", reservationId],
    queryFn: async (): Promise<GuestEmailRow[]> => {
      const { data, error } = await supabase
        .from("guest_emails")
        .select("id, kind, status, to_email, error, sent_at, created_at")
        .eq("reservation_id", reservationId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as GuestEmailRow[];
    },
    refetchInterval: (q) => (q.state.data?.some((e) => e.status === "pending") ? 5000 : false),
  });
  if (!data?.length) return null;
  return (
    <div className="space-y-1.5 rounded-lg border bg-card p-3 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-foreground">
        <Mail className="h-3.5 w-3.5" /> Emails al huésped
      </p>
      {data.map((e) => {
        const s = STATUS[e.status] ?? STATUS.pending;
        return (
          <p key={e.id} className="flex flex-wrap gap-x-1.5">
            <span>{KIND[e.kind] ?? e.kind}:</span>
            <span className={s.className}>{s.label}</span>
            {e.to_email && <span className="text-muted-foreground">· {e.to_email}</span>}
            {e.sent_at && (
              <span className="text-muted-foreground">
                ·{" "}
                {new Date(e.sent_at).toLocaleString("es-ES", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
            )}
            {e.status === "failed" && e.error && (
              <span className="text-destructive">· {e.error}</span>
            )}
          </p>
        );
      })}
    </div>
  );
}
