import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { bookingReference } from "@domain/reference.ts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { eur } from "@/lib/data";
import { useRoles } from "@/lib/roles";
import { t, currentLocale } from "@/lib/i18n";

// Money still owed to guests after a cancellation (pending_refunds): the
// suggested amount already keeps a late-cancellation fee. "Devolver" opens the
// booking, whose RefundCard refunds through the gateway; "Ya devuelta" records
// a refund the hotel made elsewhere (its gateway's back office, a transfer).
export function PendingRefunds({ onOpen }: { onOpen: (reservationId: string) => void }) {
  const qc = useQueryClient();
  const { canOperate } = useRoles();
  const [confirming, setConfirming] = useState<string | null>(null);

  const { data: owed } = useQuery({
    queryKey: ["pending_refunds"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pending_refunds");
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  const settle = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const { error } = await supabase.rpc("record_external_refund", {
        p_reservation: id,
        p_amount: amount,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setConfirming(null);
      toast.success(t("Devolución registrada"));
    },
    onError: (e: Error) => toast.error(t(e.message)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["pending_refunds"] });
      qc.invalidateQueries({ queryKey: ["refundable"] });
    },
  });

  if (!owed?.length) return null;
  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(currentLocale(), { day: "numeric", month: "short" })
      : "";

  return (
    <Card className="border-gold/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Undo2 className="h-4 w-4 text-gold" /> {t("Devoluciones pendientes")}
          <span className="text-sm font-normal text-muted-foreground">({owed.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {owed.map((r) => {
          const suggested = Number(r.suggested);
          const fee = Number(r.late_fee);
          return (
            <div key={r.reservation_id} className="rounded-md border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-xs text-muted-foreground">
                  {bookingReference(r.reservation_id)}
                </span>
                <span className="font-medium">{r.room_name}</span>
                <span>{r.guest_name ?? t("Sin nombre")}</span>
                <span className="text-muted-foreground">
                  {fmt(r.start_at)} – {fmt(r.end_at)}
                </span>
                <span className="ml-auto font-medium tabular-nums">{eur(suggested)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.status === "rejected" ? t("Pagada sin reserva válida") : t("Cancelada")}
                {r.cancelled_at ? t(" el {0}", { 0: fmt(r.cancelled_at) }) : ""}{" "}
                {t("· pagado online sin devolver")} {eur(Number(r.refundable))}
                {fee > 0 && t(" · retiene {0} por cancelación fuera de plazo", { 0: eur(fee) })}
              </p>
              {canOperate && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {confirming === r.reservation_id ? (
                    <>
                      <span className="text-xs">
                        {t("¿Registrar")} {eur(suggested)}{" "}
                        {t("como ya devueltos fuera de Melend/OS?")}
                      </span>
                      <Button
                        size="sm"
                        disabled={settle.isPending}
                        onClick={() => settle.mutate({ id: r.reservation_id, amount: suggested })}
                      >
                        {t("Sí, registrar")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                        {t("No")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => onOpen(r.reservation_id)}>
                        {t("Devolver")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirming(r.reservation_id)}
                      >
                        {t("Ya devuelta en la pasarela")}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
