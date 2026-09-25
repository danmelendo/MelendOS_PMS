import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Bot, Check, X } from "lucide-react";
import { toast } from "sonner";
import { bookingReference } from "@domain/reference.ts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { eur } from "@/lib/data";

const CHANNELS: Record<string, string> = {
  web: "web",
  web_chat: "asistente de la web",
  mcp: "asistente externo (MCP)",
  guest_app: "app del huésped",
  staff: "recepción",
};

type Decision = { id: string; approve: boolean };

// Cancellations asked for by guests (booking agent, web, app). Nothing is
// cancelled until someone at the hotel approves it here; refunds of paid
// deposits are handled with the payment provider.
export function CancellationRequests() {
  const qc = useQueryClient();
  const [pending, setPending] = useState<Decision | null>(null);
  const [note, setNote] = useState("");

  const { data: requests } = useQuery({
    queryKey: ["cancellation_requests", "pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cancellation_requests")
        .select(
          "id, reason, channel, requested_at, reservation_id, reservations(id, start_at, end_at, status, total, paid_amount, deposit_paid, rooms(name, building), customers(name, email), members(name))",
        )
        .eq("status", "pending")
        .order("requested_at");
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const decide = useMutation({
    mutationFn: async ({ id, approve }: Decision) => {
      const { error } = await supabase.rpc("decide_cancellation", {
        p_request_id: id,
        p_approve: approve,
        p_note: note.trim() || undefined,
      });
      if (error) throw error;
      return approve;
    },
    onSuccess: (approve) => {
      setPending(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["cancellation_requests"] });
      qc.invalidateQueries({ queryKey: ["reservations"] });
      toast.success(approve ? "Reserva cancelada" : "Solicitud rechazada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!requests?.length) return null;

  return (
    <Card className="border-gold/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Ban className="h-4 w-4 text-gold" /> Solicitudes de cancelación
          <span className="text-sm font-normal text-muted-foreground">({requests.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {requests.map((q) => {
          const r = q.reservations;
          const fmt = (iso?: string) =>
            iso
              ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" })
              : "";
          const confirming = pending?.id === q.id ? pending : null;
          const paid = Number(r?.paid_amount ?? 0);
          return (
            <div key={q.id} className="rounded-md border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-xs text-muted-foreground">
                  {bookingReference(q.reservation_id)}
                </span>
                <span className="font-medium">
                  {r?.rooms?.name}
                  <span className="font-normal text-muted-foreground"> · {r?.rooms?.building}</span>
                </span>
                <span>{r?.customers?.name ?? r?.members?.name ?? "Sin nombre"}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {fmt(r?.start_at)} → {fmt(r?.end_at)} · {eur(Number(r?.total ?? 0))}
                </span>
              </div>
              <p className="mt-1 flex items-start gap-1.5 text-muted-foreground">
                <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Vía {CHANNELS[q.channel] ?? q.channel}
                  {q.reason ? <> · «{q.reason}»</> : null}
                </span>
              </p>

              {confirming ? (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <p className="font-medium">
                    {confirming.approve
                      ? "¿Cancelar esta reserva? No se puede deshacer."
                      : "¿Rechazar la solicitud? La reserva sigue en pie."}
                  </p>
                  {confirming.approve && paid > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Se pagó una señal de {eur(paid)}. El reembolso, si procede, se hace desde la
                      pasarela de pago.
                    </p>
                  )}
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Nota interna (opcional)"
                    rows={2}
                    maxLength={500}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={confirming.approve ? "destructive" : "default"}
                      disabled={decide.isPending}
                      onClick={() => decide.mutate(confirming)}
                    >
                      {confirming.approve ? "Sí, cancelar reserva" : "Sí, rechazar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={decide.isPending}
                      onClick={() => {
                        setPending(null);
                        setNote("");
                      }}
                    >
                      Volver
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPending({ id: q.id, approve: true })}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" /> Aprobar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPending({ id: q.id, approve: false })}
                  >
                    <X className="mr-1 h-3.5 w-3.5" /> Rechazar
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
