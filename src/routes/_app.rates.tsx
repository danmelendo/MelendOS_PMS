import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useRateGroups, useDynamicRules } from "@/lib/data";
import { useRoles } from "@/lib/roles";
import { Navigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/rates")({
  component: RatesPage,
});

function RatesPage() {
  const { isAdmin, loading: rolesLoading } = useRoles();

  if (rolesLoading) return null;
  if (!isAdmin) return <Navigate to="/today" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tarifas</h1>
        <p className="text-sm text-muted-foreground">
          Precio por noche de cada tipo de habitación y reglas de precio dinámico
        </p>
      </div>

      <Tabs defaultValue="nightly">
        <TabsList>
          <TabsTrigger value="nightly">Por noche</TabsTrigger>
          <TabsTrigger value="dynamic">Dinámicas</TabsTrigger>
        </TabsList>

        <TabsContent value="nightly">
          <NightlyTable />
        </TabsContent>
        <TabsContent value="dynamic">
          <DynamicRulesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// One row per rate group (room type). Friday and Saturday nights use the
// weekend price when set; otherwise the weekday price applies every night.
function NightlyTable() {
  const qc = useQueryClient();
  const { data: groups } = useRateGroups();
  const { data: rates } = useQuery({
    queryKey: ["rate_nightly"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rate_nightly").select("*");
      if (error) throw error;
      return data;
    },
  });
  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { price?: number; weekend_price?: number | null };
    }) => {
      const { error } = await supabase.from("rate_nightly").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rate_nightly"] });
      toast.success("Tarifa guardada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="p-2 text-left">Tipo de habitación</th>
              <th className="p-2 text-right">Dom–jue (€/noche)</th>
              <th className="p-2 text-right">Vie–sáb (€/noche)</th>
            </tr>
          </thead>
          <tbody>
            {groups?.map((g) => {
              const r = rates?.find((x) => x.rate_group_id === g.id);
              return (
                <tr key={g.id} className="border-b last:border-0">
                  <td className="p-2 font-medium">{g.name}</td>
                  {r ? (
                    <>
                      <td className="p-2 text-right">
                        <Input
                          type="number"
                          defaultValue={r.price}
                          className="h-8 text-right tabular-nums max-w-[110px] ml-auto"
                          onBlur={(e) =>
                            update.mutate({ id: r.id, patch: { price: Number(e.target.value) } })
                          }
                        />
                      </td>
                      <td className="p-2 text-right">
                        <Input
                          type="number"
                          defaultValue={r.weekend_price ?? ""}
                          placeholder="Igual"
                          className="h-8 text-right tabular-nums max-w-[110px] ml-auto"
                          onBlur={(e) =>
                            update.mutate({
                              id: r.id,
                              patch: {
                                weekend_price: e.target.value ? Number(e.target.value) : null,
                              },
                            })
                          }
                        />
                      </td>
                    </>
                  ) : (
                    <td colSpan={2} className="p-2 text-right text-muted-foreground">
                      Sin tarifa por noche
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function DynamicRulesPanel() {
  const qc = useQueryClient();
  const { data } = useDynamicRules();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"occupancy" | "date">("occupancy");
  const [name, setName] = useState("");
  const [multiplier, setMultiplier] = useState(15);
  const [threshold, setThreshold] = useState(70);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const config = type === "occupancy" ? { threshold } : { from, to };
      const { error } = await supabase.from("dynamic_rules").insert({
        type,
        name,
        multiplier,
        config: config as never,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dynamic_rules"] });
      setOpen(false);
      toast.success("Regla creada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("dynamic_rules").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dynamic_rules"] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dynamic_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dynamic_rules"] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Se aplican noche a noche sobre la tarifa base. Las de fecha y ocupación se acumulan.
        </p>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nueva regla
        </Button>
      </div>

      <div className="grid gap-2">
        {data?.map((r) => {
          const cfg = r.config as { threshold?: number; from?: string; to?: string };
          return (
            <Card key={r.id}>
              <CardContent className="p-3 flex items-center gap-3 flex-wrap">
                <Badge variant="outline">{r.type === "occupancy" ? "Ocupación" : "Fecha"}</Badge>
                <div className="font-medium">{r.name}</div>
                <div className="text-sm text-muted-foreground">
                  {r.type === "occupancy"
                    ? `≥ ${cfg.threshold}% ocupación`
                    : `${cfg.from} → ${cfg.to}`}
                </div>
                <div className="text-sm font-semibold text-gold-foreground">+{r.multiplier}%</div>
                <div className="ml-auto flex items-center gap-2">
                  <Switch
                    checked={r.active}
                    onCheckedChange={(active) => toggle.mutate({ id: r.id, active })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => remove.mutate(r.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!data?.length && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Sin reglas. Crea la primera.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva regla dinámica</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as "occupancy" | "date")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="occupancy">Por ocupación</SelectItem>
                  <SelectItem value="date">Por fecha</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Temporada alta, Alta ocupación"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Recargo (%)</Label>
              <Input
                type="number"
                value={multiplier}
                onChange={(e) => setMultiplier(Number(e.target.value))}
              />
            </div>
            {type === "occupancy" ? (
              <div className="space-y-1.5">
                <Label>Umbral de ocupación (%)</Label>
                <Input
                  type="number"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Desde</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Hasta</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => create.mutate()} disabled={!name}>
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
