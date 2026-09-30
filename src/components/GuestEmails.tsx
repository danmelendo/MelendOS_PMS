import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/lib/roles";
import { t, currentLocale } from "@/lib/i18n";

// Emails sent to the guest about this booking (confirmation, cancellation,
// check-in invite), queued by the database and sent by guest-emails-dispatch.
// Reception can (re)send the single-use online check-in link from here.

const KIND: Record<string, string> = {
  booking_confirmed: "Confirmación",
  booking_cancelled: "Cancelación",
  checkin_invite: "Check-in online",
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
  const qc = useQueryClient();
  const { canOperate } = useRoles();
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

  const invite = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("request_checkin_invite", { p_id: reservationId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(t("Enlace de check-in enviado al huésped"));
      qc.invalidateQueries({ queryKey: ["guest-emails", reservationId] });
    },
    onError: (e: Error) => toast.error(t(e.message)),
  });

  if (!data?.length && !canOperate) return null;
  return (
    <div className="space-y-2 rounded-lg border bg-card p-3 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-foreground">
        <Mail className="h-3.5 w-3.5" /> {t("Emails al huésped")}
      </p>
      {data?.map((e) => {
        const s = STATUS[e.status] ?? STATUS.pending;
        return (
          <p key={e.id} className="flex flex-wrap gap-x-1.5">
            <span>{t(KIND[e.kind] ?? e.kind)}:</span>
            <span className={s.className}>{t(s.label)}</span>
            {e.to_email && <span className="text-muted-foreground">· {e.to_email}</span>}
            {e.sent_at && (
              <span className="text-muted-foreground">
                ·{" "}
                {new Date(e.sent_at).toLocaleString(currentLocale(), {
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
      {canOperate && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => invite.mutate()}
            disabled={invite.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            {invite.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}

            {t("Enviar enlace de check-in online")}
          </button>
          <p className="mt-1 text-muted-foreground">
            {t(
              "Enlace de un solo uso: el huésped rellena los datos del viajero y firma desde su móvil.",
            )}
          </p>
        </div>
      )}
    </div>
  );
}
