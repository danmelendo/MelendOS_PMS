import { useEffect, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Minus } from "lucide-react";
import { toast } from "sonner";
import {
  BASE_INCLUDES,
  FEATURES,
  MODULES,
  PACKAGE_IDS,
  PACKAGES,
  type PackageId,
} from "@domain/features.ts";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DEMO_ACCESS } from "@/lib/demo-access";
import { useStaffHotelModules, type StaffHotel } from "@/lib/features";
import { useRoles } from "@/lib/roles";
import { PlatformOnly } from "@/components/settings/AdminOnly";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/_app/plan")({
  component: () => (
    <PlatformOnly>
      <PlanPage />
    </PlatformOnly>
  ),
});

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  group: "Grupo",
};

function PackageCard({
  hotel,
  id,
  onToggle,
  saving,
}: {
  hotel: StaffHotel;
  id: PackageId;
  onToggle: (on: boolean) => void;
  saving: boolean;
}) {
  const contracted = hotel.packages.includes(id);
  const modules = FEATURES.filter((f) => MODULES[f].package === id);
  return (
    <Card className={contracted ? "border-info/50" : undefined}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            {t(PACKAGES[id].name)}
            {contracted ? (
              <Badge className="bg-info text-info-foreground hover:bg-info">
                {t("Contratado")}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                {t("No contratado")}
              </Badge>
            )}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t(PACKAGES[id].description)}</p>
        </div>
        {DEMO_ACCESS && (
          <Switch
            checked={contracted}
            disabled={saving}
            onCheckedChange={onToggle}
            aria-label={`Paquete ${t(PACKAGES[id].name)}`}
          />
        )}
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {modules.map((f) => {
            const on = hotel.features[f];
            const custom = hotel.overrides[f] !== undefined;
            return (
              <li key={f} className="flex items-start gap-2 text-sm">
                {on ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                ) : (
                  <Minus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <span className={on ? "font-medium" : "text-muted-foreground"}>
                    {t(MODULES[f].name)}
                  </span>
                  {custom && (
                    <span className="ml-2 text-xs text-gold">
                      {on ? t("activado aparte") : t("desactivado aparte")}
                    </span>
                  )}
                  <p className="text-xs text-muted-foreground">{t(MODULES[f].description)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// What the hotel has contracted: the base plus optional packages of modules.
// In the demo, admins can switch packages on and off to try them.
function PlanPage() {
  const { isAdmin, loading } = useRoles();
  const { data: hotels } = useStaffHotelModules();
  const [hotelId, setHotelId] = useState<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!hotelId && hotels?.length) setHotelId(hotels[0].id);
  }, [hotelId, hotels]);
  const hotel = hotels?.find((h) => h.id === hotelId) ?? null;

  const save = useMutation({
    mutationFn: async (packages: PackageId[]) => {
      const { data, error } = await supabase.functions.invoke("tenant-modules", {
        body: { tenant_id: hotelId, packages },
      });
      if (error || !data) throw new Error("No se pudo cambiar el plan");
    },
    // Menus, pages, the web and the guest app all read the hotel's modules.
    onSuccess: () => qc.invalidateQueries(),
    onError: (e: Error) => toast.error(t(e.message)),
  });

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/today" />;

  const toggle = (id: PackageId, on: boolean) => {
    if (!hotel) return;
    const next = PACKAGE_IDS.filter((p) => (p === id ? on : hotel.packages.includes(p)));
    save.mutate(next, {
      onSuccess: () =>
        toast.success(
          `${t(PACKAGES[id].name)} ${on ? "activado" : "desactivado"} en ${hotel.name}`,
        ),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("Plan y módulos")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Cada hotel contrata solo lo que necesita: la base y los paquetes que elija.")}
          </p>
        </div>
        {hotels && hotels.length > 1 && (
          <Select value={hotelId ?? undefined} onValueChange={setHotelId}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {hotels.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {hotel && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                {t("Base")}
                <Badge variant="secondary">
                  {t("Plan")} {PLAN_LABELS[hotel.plan] ?? hotel.plan}
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t("Incluida en todos los planes.")}</p>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 text-sm sm:grid-cols-2">
                {BASE_INCLUDES.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-info" /> {b}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {PACKAGE_IDS.map((id) => (
              <PackageCard
                key={id}
                hotel={hotel}
                id={id}
                saving={save.isPending}
                onToggle={(on) => toggle(id, on)}
              />
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            {DEMO_ACCESS
              ? t(
                  "Demo: activa o desactiva paquetes para ver cómo cambian el panel y la web de reservas. En producción los paquetes se contratan con ventas.",
                )
              : t("Para contratar un paquete o darlo de baja, contacta con ventas.")}
          </p>
        </>
      )}
    </div>
  );
}
