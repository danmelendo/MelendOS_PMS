import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { NewReservationDialog } from "@/components/NewReservationDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRoles } from "@/lib/roles";
import { Wand2 } from "lucide-react";

export const Route = createFileRoute("/_app/admin/manual")({
  component: ManualReservationPage,
});

function ManualReservationPage() {
  const { isAdmin, loading } = useRoles();
  const [open, setOpen] = useState(false);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/today" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reserva manual</h1>
        <p className="text-sm text-muted-foreground">
          Crea reservas con salida y precio editables. Para excepciones que recepción no puede hacer
          desde el flujo normal.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-gold" />
            ¿Qué puedes hacer aquí?
          </CardTitle>
          <CardDescription>Sólo administradores</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="text-sm space-y-1.5 list-disc pl-5 text-muted-foreground">
            <li>Definir una hora de salida libre (por ejemplo, un late checkout).</li>
            <li>Sobrescribir el total final con el precio que quieras.</li>
            <li>Saltarse la separación obligatoria de 15 min entre reservas.</li>
          </ul>
          <Button onClick={() => setOpen(true)}>
            <Wand2 className="mr-2 h-4 w-4" /> Crear reserva manual
          </Button>
        </CardContent>
      </Card>

      <NewReservationDialog open={open} onOpenChange={setOpen} mode="admin" />
    </div>
  );
}
