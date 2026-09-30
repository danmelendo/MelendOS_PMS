import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useExtras, eur, EXTRA_CATEGORY_LABELS } from "@/lib/data";
import { useRoles } from "@/lib/roles";
import { Navigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/_app/extras")({
  component: ExtrasPage,
});

const CATEGORY_LABELS: Record<string, string> = EXTRA_CATEGORY_LABELS;

function ExtrasPage() {
  const { isAdmin, loading: rolesLoading } = useRoles();
  const { data } = useExtras();
  const qc = useQueryClient();

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { name?: string; price?: number; active?: boolean };
    }) => {
      const { error } = await supabase.from("extras").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["extras"] });
      toast.success(t("Guardado"));
    },
  });

  if (rolesLoading) return null;
  if (!isAdmin) return <Navigate to="/today" />;

  const cats = Array.from(new Set(data?.map((e) => e.category) ?? []));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("Extras")}</h1>
        <p className="text-sm text-muted-foreground">{t("Catálogo editable de extras")}</p>
      </div>

      {cats.map((c) => (
        <Card key={c}>
          <CardHeader>
            <CardTitle className="text-base">{t(CATEGORY_LABELS[c])}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-y">
                <tr>
                  <th className="p-2 text-left">{t("Nombre")}</th>
                  <th className="p-2 text-right">{t("Precio")}</th>
                  <th className="p-2 text-right">{t("Activo")}</th>
                </tr>
              </thead>
              <tbody>
                {data
                  ?.filter((e) => e.category === c)
                  .map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="p-2">
                        <Input
                          defaultValue={e.name}
                          className="h-8"
                          onBlur={(ev) =>
                            update.mutate({ id: e.id, patch: { name: ev.target.value } })
                          }
                        />
                        {e.description && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {e.description}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <Input
                          type="number"
                          step="0.5"
                          defaultValue={e.price}
                          className="h-8 text-right tabular-nums max-w-[100px] ml-auto"
                          onBlur={(ev) =>
                            update.mutate({ id: e.id, patch: { price: Number(ev.target.value) } })
                          }
                        />
                      </td>
                      <td className="p-2 text-right">
                        <Switch
                          checked={e.active}
                          onCheckedChange={(active) =>
                            update.mutate({ id: e.id, patch: { active } })
                          }
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

void eur;
