import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { eur } from "@/lib/data";
import { useRoles } from "@/lib/roles";

// Money paid online for a booking and what can still be given back through
// the hotel's gateway (payments-refund). Reception and management only.

interface RefundablePayment {
  id: string;
  provider: string;
  amount: number;
  refunded_amount: number;
  refundable: number;
  created_at: string;
}

async function functionError(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  try {
    const body = ctx ? await ctx.json() : null;
    if (body?.error) return String(body.error);
  } catch {
    /* not JSON */
  }
  return fallback;
}

export function RefundCard({ reservationId }: { reservationId: string }) {
  const { canOperate } = useRoles();
  const qc = useQueryClient();
  const { data: payments } = useQuery({
    queryKey: ["refundable", reservationId],
    queryFn: async (): Promise<RefundablePayment[]> => {
      const { data, error } = await supabase.rpc("refundable_payments", {
        p_reservation: reservationId,
      });
      if (error) throw error;
      return (data ?? []) as RefundablePayment[];
    },
  });
  const refundable = (payments ?? []).reduce((s, p) => s + Number(p.refundable), 0);
  const [amount, setAmount] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const refund = useMutation({
    mutationFn: async (value: number) => {
      const { data, error } = await supabase.functions.invoke("payments-refund", {
        body: { reservation_id: reservationId, amount: value },
      });
      if (error) throw new Error(await functionError(error, "No se pudo devolver"));
      return data as { refunded: number };
    },
    onSuccess: (r) => {
      toast.success(`Devueltos ${eur(r.refunded)} a la tarjeta`);
      setConfirming(false);
      setAmount("");
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["refundable", reservationId] });
      qc.invalidateQueries({ queryKey: ["pending_refunds"] });
      qc.invalidateQueries({ queryKey: ["reservations"] });
    },
  });

  if (!payments?.length) return null;
  const value = Number((amount || String(refundable)).replace(",", "."));
  const valid = value > 0 && value <= refundable + 0.001;

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-foreground">
        <Undo2 className="h-3.5 w-3.5" /> Pagos online y devoluciones
      </p>
      {payments.map((p) => (
        <p key={p.id} className="flex flex-wrap justify-between gap-x-2">
          <span>
            {p.provider === "redsys" ? "Redsys" : "Stripe"} ·{" "}
            {new Date(p.created_at).toLocaleDateString("es-ES")}
          </span>
          <span className="tabular-nums">
            {eur(Number(p.amount))}
            {Number(p.refunded_amount) > 0 && (
              <span className="text-muted-foreground">
                {" "}
                · devueltos {eur(Number(p.refunded_amount))}
              </span>
            )}
          </span>
        </p>
      ))}
      {canOperate && refundable > 0 && (
        <div className="space-y-2 border-t pt-2">
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>¿Devolver {eur(value)} a la tarjeta? No se puede deshacer.</span>
              <Button
                size="sm"
                variant="destructive"
                disabled={refund.isPending}
                onClick={() => refund.mutate(value)}
              >
                {refund.isPending ? "Devolviendo…" : "Devolver"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                No
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                inputMode="decimal"
                className="h-8 w-28"
                placeholder={refundable.toFixed(2)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Importe a devolver"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!valid}
                onClick={() => setConfirming(true)}
              >
                Devolver
              </Button>
              <span className="text-muted-foreground">máx. {eur(refundable)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
