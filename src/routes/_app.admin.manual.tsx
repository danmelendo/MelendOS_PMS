import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { NewReservationDialog } from "@/components/NewReservationDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRoles } from "@/lib/roles";
import { Wand2 } from "lucide-react";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/_app/admin/manual")({
  component: ManualReservationPage,
});

function ManualReservationPage() {
  const { isAdmin, canOperate, loading } = useRoles();
  const [open, setOpen] = useState(false);

  if (loading) return null;
  if (!isAdmin || !canOperate) return <Navigate to="/today" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("Reserva manual")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Crea reservas con salida y precio editables. Para excepciones que recepción no puede hacer desde el flujo normal.",
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-gold" />

            {t("¿Qué puedes hacer aquí?")}
          </CardTitle>
          <CardDescription>{t("Sólo administradores")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="text-sm space-y-1.5 list-disc pl-5 text-muted-foreground">
            <li>{t("Definir una hora de salida libre (por ejemplo, un late checkout).")}</li>
            <li>{t("Sobrescribir el total final con el precio que quieras.")}</li>
            <li>{t("Saltarse la separación obligatoria de 15 min entre reservas.")}</li>
          </ul>
          <Button onClick={() => setOpen(true)}>
            <Wand2 className="mr-2 h-4 w-4" /> {t("Crear reserva manual")}
          </Button>
        </CardContent>
      </Card>

      <NewReservationDialog open={open} onOpenChange={setOpen} mode="admin" />
    </div>
  );
}
