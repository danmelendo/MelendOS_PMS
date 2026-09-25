import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  bookingsByMonth,
  dailyKpis,
  leadTimeBuckets,
  monthlyKpis,
  summarize,
  type StayFact,
} from "@domain/kpis.ts";
import { addDays } from "@domain/dates.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { eur, useRooms } from "@/lib/data";
import {
  CHANNELS,
  PERIODS,
  periodRange,
  useStaffHotels,
  useStayFacts,
  type Period,
} from "@/lib/reports";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

const C = {
  navy: "var(--chart-1)",
  sky: "var(--chart-2)",
  gold: "var(--chart-3)",
  slate: "var(--chart-4)",
  grid: "var(--border)",
  text: "var(--muted-foreground)",
};

const eurCompact = (v: number) =>
  v >= 100_000
    ? new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: "EUR",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(v)
    : eur(v);
const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)} %`;
const monthLabel = (m: string) =>
  new Date(`${m}-01T12:00:00Z`).toLocaleDateString("es-ES", { month: "short", year: "2-digit" });
const dayLabel = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

function ReportsPage() {
  const [period, setPeriod] = useState<Period>("12m");
  const [hotel, setHotel] = useState<string>("all");
  const range = periodRange(period);
  const { data: hotels } = useStaffHotels();
  const { data: rooms } = useRooms();
  // One request covers the period and the same period last year.
  const { data, isPending, error } = useStayFacts(range.lyFrom, range.to);

  const view = useMemo(() => {
    if (!data) return null;
    const inScope = (tenantId: string) => hotel === "all" || tenantId === hotel;
    const facts = data.stays.filter((s) => inScope(s.tenantId));
    const roomCount = Object.entries(data.rooms)
      .filter(([t]) => inScope(t))
      .reduce((s, [, n]) => s + n, 0);
    const now = summarize(facts, roomCount, range.from, range.to);
    const ly = summarize(facts, roomCount, range.lyFrom, range.lyTo);
    const days = dailyKpis(facts, roomCount, range.from, range.to);
    const lyDays = dailyKpis(facts, roomCount, range.lyFrom, range.lyTo);
    // Compare with last year only when the history covers all of it.
    const firstNight = facts.reduce((m, f) => (f.checkIn < m ? f.checkIn : m), "9999-12-31");
    const hasLy = firstNight <= range.lyFrom && ly.sold > 0;
    // Long periods: 7-day moving average, easier to read than daily noise.
    const smooth = days.length > 120 ? 7 : 1;
    const avg = (xs: { occupancy: number }[], i: number) => {
      const w = xs.slice(Math.max(0, i - smooth + 1), i + 1);
      return w.reduce((s, x) => s + x.occupancy, 0) / w.length;
    };
    const daily = days.map((d, i) => ({
      day: d.day,
      occupancy: avg(days, i),
      ly: hasLy ? avg(lyDays, i) : null,
    }));
    return {
      facts,
      now,
      smooth,
      ly: hasLy ? ly : null,
      daily,
      monthly: monthlyKpis(days),
      bookings: bookingsByMonth(facts, range.from, range.to),
      lead: leadTimeBuckets(facts, range.from, range.to),
    };
  }, [data, hotel, range.from, range.to, range.lyFrom, range.lyTo]);

  const topRooms = useMemo(() => {
    if (!view) return [];
    const byRoom = new Map<string, { nights: number; revenue: number }>();
    for (const f of view.facts as StayFact[]) {
      if (!["confirmed", "in_progress", "completed"].includes(f.status)) continue;
      const nights = Math.max(
        0,
        Math.min(
          (Date.parse(f.checkOut) - Date.parse(f.checkIn)) / 86_400_000,
          (Date.parse(addDays(range.to, 1)) - Date.parse(f.checkIn)) / 86_400_000,
          (Date.parse(f.checkOut) - Date.parse(range.from)) / 86_400_000,
        ),
      );
      if (!nights) continue;
      const total = (Date.parse(f.checkOut) - Date.parse(f.checkIn)) / 86_400_000;
      const acc = byRoom.get(f.roomId) ?? { nights: 0, revenue: 0 };
      acc.nights += nights;
      acc.revenue += (f.roomRevenue * nights) / total;
      byRoom.set(f.roomId, acc);
    }
    return [...byRoom]
      .map(([id, v]) => {
        const r = rooms?.find((x) => x.id === id);
        return { id, name: r ? `${r.name} · ${r.building}` : "—", ...v };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [view, rooms, range.from, range.to]);

  // Several roles map to the same channel (admin, staff… = reception).
  const channels = view
    ? [
        ...Object.entries(view.now.channels).reduce((acc, [k, n]) => {
          const name = CHANNELS[k] ?? k;
          return acc.set(name, (acc.get(name) ?? 0) + n);
        }, new Map<string, number>()),
      ]
        .map(([name, bookings]) => ({ name, bookings }))
        .sort((a, b) => b.bookings - a.bookings)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Informes</h1>
          <p className="text-sm text-muted-foreground">
            Ocupación, ingresos y comportamiento de reserva
            {period === "ahead" ? " · reservas ya confirmadas" : ""}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Select value={hotel} onValueChange={setHotel}>
            <SelectTrigger className="min-w-0 flex-1 sm:w-48 sm:flex-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los hoteles</SelectItem>
              {hotels?.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="min-w-0 flex-1 sm:w-56 sm:flex-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PERIODS).map(([k, label]) => (
                <SelectItem key={k} value={k}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive">No se pudieron cargar los datos.</p>
      ) : isPending || !view ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Calculando…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6 [&>*]:min-w-0">
            <Kpi
              label="Ocupación"
              value={pct(view.now.occupancy, 1)}
              delta={view.ly && (view.now.occupancy - view.ly.occupancy) * 100}
              unit="pts"
              accent
            />
            <Kpi
              label="ADR"
              hint="Precio medio por noche vendida"
              value={eur(view.now.adr)}
              delta={view.ly && relative(view.now.adr, view.ly.adr)}
            />
            <Kpi
              label="RevPAR"
              hint="Ingreso por habitación disponible"
              value={eur(view.now.revpar)}
              delta={view.ly && relative(view.now.revpar, view.ly.revpar)}
            />
            <Kpi
              label="Ingresos alojamiento"
              value={eurCompact(view.now.revenue)}
              delta={view.ly && relative(view.now.revenue, view.ly.revenue)}
            />
            <Kpi
              label="Reservas hechas"
              value={String(view.now.bookings)}
              hint={`${pct(view.now.cancelRate)} canceladas`}
              delta={view.ly && relative(view.now.bookings, view.ly.bookings)}
            />
            <Kpi
              label="Antelación media"
              value={`${Math.round(view.now.avgLeadDays)} días`}
              hint={`Estancia media ${view.now.avgLengthOfStay.toFixed(1)} noches`}
            />
          </div>

          <ChartCard
            title={view.smooth > 1 ? "Ocupación (media de 7 días)" : "Ocupación diaria"}
            legend={[
              { color: C.navy, label: period === "ahead" ? "En cartera" : "Este periodo" },
              { color: C.gold, label: "Año anterior", dashed: true },
            ]}
          >
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={view.daily} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="occ" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.navy} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.navy} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={dayLabel}
                  tick={{ fill: C.text, fontSize: 11 }}
                  minTickGap={28}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 1]}
                  tickFormatter={(v) => pct(v)}
                  tick={{ fill: C.text, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip
                  labelFormatter={(d) => dayLabel(String(d))}
                  formatter={(v, name) => [
                    v == null ? "—" : pct(Number(v), 1),
                    name === "ly" ? "Año anterior" : "Ocupación",
                  ]}
                />
                {period !== "ahead" && period !== "ytd" && (
                  <ReferenceLine x={range.today} stroke={C.gold} strokeDasharray="3 3" />
                )}
                <Area
                  type="monotone"
                  dataKey="occupancy"
                  stroke={C.navy}
                  strokeWidth={1.6}
                  fill="url(#occ)"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="ly"
                  stroke={C.gold}
                  strokeWidth={1.2}
                  strokeDasharray="4 3"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <ChartCard
              title="ADR y RevPAR por mes"
              legend={[
                { color: C.sky, label: "RevPAR" },
                { color: C.navy, label: "ADR" },
              ]}
            >
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart
                  data={view.monthly}
                  margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                >
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={monthLabel}
                    tick={{ fill: C.text, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v} €`}
                    tick={{ fill: C.text, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                  />
                  <Tooltip
                    labelFormatter={(m) => monthLabel(String(m))}
                    formatter={(v, name) => [eur(Number(v)), name === "adr" ? "ADR" : "RevPAR"]}
                  />
                  <Bar
                    dataKey="revpar"
                    fill={C.sky}
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="adr"
                    stroke={C.navy}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Reservas y cancelaciones por mes de reserva"
              legend={[
                { color: C.navy, label: "Reservas" },
                { color: C.gold, label: "Canceladas" },
              ]}
            >
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={view.bookings} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={monthLabel}
                    tick={{ fill: C.text, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: C.text, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    labelFormatter={(m) => monthLabel(String(m))}
                    formatter={(v, name) => [v, name === "cancelled" ? "Canceladas" : "Reservas"]}
                  />
                  <Bar
                    dataKey="bookings"
                    fill={C.navy}
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="cancelled"
                    fill={C.gold}
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Con cuánta antelación reservan">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={view.lead} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: C.text, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: C.text, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip formatter={(v) => [v, "Reservas"]} />
                  <Bar
                    dataKey="bookings"
                    fill={C.sky}
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Canal de reserva">
              <div className="space-y-3 py-2">
                {channels.map((c) => (
                  <div key={c.name}>
                    <div className="flex justify-between text-sm">
                      <span>{c.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {c.bookings} · {pct(c.bookings / Math.max(1, view.now.bookings))}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${(c.bookings / Math.max(1, view.now.bookings)) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
                {!channels.length && (
                  <p className="py-6 text-center text-sm text-muted-foreground">Sin reservas.</p>
                )}
              </div>
            </ChartCard>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Habitaciones por ingresos</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead className="border-y bg-muted/30">
                    <tr>
                      <th className="p-2 pl-4 text-left">Habitación</th>
                      <th className="p-2 text-right">Noches</th>
                      <th className="p-2 text-right">Ocupación</th>
                      <th className="p-2 pr-4 text-right">Ingresos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRooms.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="p-2 pl-4">{r.name}</td>
                        <td className="p-2 text-right tabular-nums">{Math.round(r.nights)}</td>
                        <td className="p-2 text-right tabular-nums">
                          {pct(r.nights / Math.max(1, view.daily.length))}
                        </td>
                        <td className="p-2 pr-4 text-right tabular-nums">{eur(r.revenue)}</td>
                      </tr>
                    ))}
                    {!topRooms.length && (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-muted-foreground">
                          Sin datos.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

const relative = (a: number, b: number) => (b ? ((a - b) / b) * 100 : null);

function Kpi({
  label,
  value,
  hint,
  delta,
  unit = "%",
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  unit?: "%" | "pts";
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "border-gold/50" : undefined}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 truncate text-2xl font-bold tabular-nums">{value}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {delta != null && Number.isFinite(delta) && (
            <span
              className={
                delta >= 0
                  ? "font-medium text-emerald-700 dark:text-emerald-400"
                  : "font-medium text-red-600 dark:text-red-400"
              }
              title="Frente al mismo periodo del año anterior"
            >
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)} {unit === "pts" ? "pts" : "%"}
            </span>
          )}
          {hint && <span className="truncate">{hint}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  legend,
  children,
}: {
  title: string;
  legend?: { color: string; label: string; dashed?: boolean }[];
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {legend && (
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {legend.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-0.5 w-4"
                  style={{
                    background: l.dashed
                      ? `repeating-linear-gradient(90deg, ${l.color} 0 4px, transparent 4px 7px)`
                      : l.color,
                    height: l.dashed ? 2 : 8,
                    borderRadius: 2,
                  }}
                />
                {l.label}
              </span>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="pl-2 pr-4">{children}</CardContent>
    </Card>
  );
}
