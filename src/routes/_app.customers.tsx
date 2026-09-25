import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const { data } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      // reservations.customer_id is ON DELETE SET NULL, so existing
      // reservations are kept (they just lose the customer link).
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente eliminado");
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = data?.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(s) ||
      c.phone?.includes(s) ||
      c.email?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
        <p className="text-sm text-muted-foreground">Fichas de clientes registrados</p>
      </div>
      <Input
        placeholder="Buscar por nombre, teléfono o email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="p-2 text-left">Nombre</th>
                  <th className="p-2 text-left">Teléfono</th>
                  <th className="p-2 text-left">Email</th>
                  <th className="p-2 text-left">Notas</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered?.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-2">{c.name ?? "—"}</td>
                    <td className="p-2 font-mono text-xs">{c.phone ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{c.email ?? "—"}</td>
                    <td className="p-2 text-muted-foreground text-xs">{c.notes ?? ""}</td>
                    <td className="p-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        title="Eliminar cliente"
                        disabled={del.isPending}
                        onClick={() => {
                          const label = c.name || c.email || "este cliente";
                          if (
                            window.confirm(
                              `¿Eliminar a «${label}»? Esta acción no se puede deshacer.`,
                            )
                          ) {
                            del.mutate(c.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!filtered?.length && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      Sin clientes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
