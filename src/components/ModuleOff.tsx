import { Link } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { MODULES, PACKAGES, type Feature } from "@domain/features.ts";
import { Card, CardContent } from "@/components/ui/card";
import { useRoles } from "@/lib/roles";

/** Shown instead of a page when the selected hotel has not got the module. */
export function ModuleOff({ feature, hotel }: { feature: Feature; hotel: string }) {
  const { isPlatform } = useRoles();
  const m = MODULES[feature];
  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-6">
        <Boxes className="mt-0.5 h-5 w-5 shrink-0 text-info" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">
            {m.name} no está activo en {hotel}
          </p>
          <p className="text-muted-foreground">
            {m.description} Forma parte del paquete {PACKAGES[m.package].name}.{" "}
            {isPlatform ? (
              <Link to="/plan" className="font-medium text-foreground underline">
                Ver plan y módulos
              </Link>
            ) : (
              "Para activarlo, contacta con Melend/OS."
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
