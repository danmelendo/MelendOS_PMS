import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

/**
 * Lets staff extend a room's cleaning time (typically detected at check-out).
 * Asks for confirmation and, via the extend_cleaning_and_shift RPC, pushes any
 * following reservations forward so they only start once cleaning has finished.
 */
export function ExtendCleaningButton({
  reservationId,
  currentCleaning,
}: {
  reservationId: string;
  currentCleaning: number;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState<number>(Math.max(15, (currentCleaning || 15) + 15));

  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc(
        "extend_cleaning_and_shift" as never,
        {
          p_reservation_id: reservationId,
          p_cleaning_minutes: Math.max(15, minutes || 15),
        } as never,
      );
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (moved) => {
      qc.invalidateQueries({ queryKey: ["reservations"] });
      toast.success(
        moved > 0 ? `Limpieza ampliada · ${moved} reserva(s) reprogramada(s)` : "Limpieza ampliada",
      );
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        title="Ampliar limpieza"
        onClick={() => {
          setMinutes(Math.max(15, (currentCleaning || 15) + 15));
          setOpen(true);
        }}
      >
        <Sparkles className="h-3.5 w-3.5 sm:mr-1" />
        <span className="hidden sm:inline">Ampliar limpieza</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ampliar tiempo de limpieza</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              La habitación quedará no reservable durante este tiempo tras la reserva. Si hay
              reservas posteriores que se solapen, se <strong>retrasarán automáticamente</strong>{" "}
              hasta que termine la limpieza.
            </p>
            <div className="space-y-1.5">
              <Label>Tiempo de limpieza total (min)</Label>
              <Input
                type="number"
                min={15}
                step={5}
                value={minutes}
                onChange={(e) => setMinutes(Math.max(15, Number(e.target.value) || 15))}
              />
              <div className="text-[10px] text-muted-foreground">
                Actual: {currentCleaning || 15} min · mínimo 15 min.
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => m.mutate()} disabled={m.isPending}>
              {m.isPending ? "Aplicando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
