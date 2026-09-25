import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { eur, useRooms } from "@/lib/data";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: rooms } = useRooms();

  const { data: reservations } = useQuery({
    queryKey: ["reports", from, to],
    queryFn: async () => {
      const start = new Date(from + "T00:00:00").toISOString();
      const end = new Date(to + "T23:59:59").toISOString();
      const { data, error } = await supabase
        .from("reservations")
        .select("*, rooms(name,building), reservation_extras(qty,unit_price,is_gift,extras(name))")
        .gte("start_at", start)
        .lte("start_at", end);
      if (error) throw error;
      return data;
    },
  });

  const valid =
    reservations?.filter((r) => r.status !== "cancelled" && r.status !== "no_show") ?? [];
  const totalIngresos = valid.reduce((s, r) => s + Number(r.total), 0);
  const totalReservas = valid.length;
  const ocupacionMedia = rooms?.length
    ? (totalReservas /
        (rooms.filter((r) => r.active).length || 1) /
        Math.max(
          1,
          Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1,
        )) *
      100
    : 0;

  // Habitaciones más reservadas
  const byRoom = new Map<string, { name: string; count: number; total: number }>();
  for (const r of valid) {
    const key = r.rooms ? `${r.rooms.building} · ${r.rooms.name}` : "?";
    const cur = byRoom.get(key) ?? { name: key, count: 0, total: 0 };
    cur.count += 1;
    cur.total += Number(r.total);
    byRoom.set(key, cur);
  }
  const topRooms = Array.from(byRoom.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Extras
  const byExtra = new Map<string, { name: string; qty: number; total: number }>();
  for (const r of valid) {
    for (const ex of r.reservation_extras ?? []) {
      const name = ex.extras?.name ?? "?";
      const cur = byExtra.get(name) ?? { name, qty: 0, total: 0 };
      cur.qty += ex.qty;
      cur.total += ex.is_gift ? 0 : ex.qty * Number(ex.unit_price);
      byExtra.set(name, cur);
    }
  }
  const topExtras = Array.from(byExtra.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Informes</h1>
        <p className="text-sm text-muted-foreground">Caja, ocupación y extras</p>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <div className="space-y-1.5">
          <Label>Desde</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Hasta</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Ingresos</div>
            <div className="text-2xl font-bold mt-1">{eur(totalIngresos)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Reservas</div>
            <div className="text-2xl font-bold mt-1">{totalReservas}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Ocupación media</div>
            <div className="text-2xl font-bold mt-1">{ocupacionMedia.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Habitaciones más reservadas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-y">
                <tr>
                  <th className="p-2 text-left">Habitación</th>
                  <th className="p-2 text-right">Reservas</th>
                  <th className="p-2 text-right">Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {topRooms.map((r) => (
                  <tr key={r.name} className="border-b last:border-0">
                    <td className="p-2">{r.name}</td>
                    <td className="p-2 text-right tabular-nums">{r.count}</td>
                    <td className="p-2 text-right tabular-nums">{eur(r.total)}</td>
                  </tr>
                ))}
                {!topRooms.length && (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-muted-foreground">
                      Sin datos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Extras más vendidos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-y">
                <tr>
                  <th className="p-2 text-left">Extra</th>
                  <th className="p-2 text-right">Cantidad</th>
                  <th className="p-2 text-right">Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {topExtras.map((e) => (
                  <tr key={e.name} className="border-b last:border-0">
                    <td className="p-2">{e.name}</td>
                    <td className="p-2 text-right tabular-nums">{e.qty}</td>
                    <td className="p-2 text-right tabular-nums">{eur(e.total)}</td>
                  </tr>
                ))}
                {!topExtras.length && (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-muted-foreground">
                      Sin datos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
