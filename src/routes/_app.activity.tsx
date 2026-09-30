import { useEffect, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Activity, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStaffHotelModules } from "@/lib/features";
import { useRoles } from "@/lib/roles";
import { ATTENTION, bytes, CHANNEL_LABELS, useHotelActivity } from "@/lib/activity";
import { PlatformOnly } from "@/components/settings/AdminOnly";
import { t, currentLocale } from "@/lib/i18n";

export const Route = createFileRoute("/_app/activity")({
  component: () => (
    <PlatformOnly>
      <ActivityPage />
    </PlatformOnly>
  ),
});

const QUEUES: { key: "ses" | "verifactu" | "emails" | "channels"; label: string }[] = [
  { key: "ses", label: "Registro de viajeros (SES)" },
  { key: "verifactu", label: "VERI*FACTU" },
  { key: "emails", label: "Emails al huésped" },
  { key: "channels", label: "Canales (OTAs)" },
];

const STATUS: Record<string, string> = {
  pending: "en cola",
  sent: "enviados",
  accepted: "aceptados",
  accepted_with_errors: "aceptados con errores",
  simulated: "simulados",
  skipped: "omitidos",
  blocked: "bloqueados",
  rejected: "rechazados",
  error: "con error",
  failed: "fallidos",
  cancelled: "anulados",
  done: "hechos",
};

const n = (v: number) => Number(v).toLocaleString(currentLocale());
const secs = (ms: number | null) => (ms != null ? `${(ms / 1000).toFixed(1)} s` : "—");

function ActivityPage() {
  const { isAdmin, loading } = useRoles();
  const { data: hotels } = useStaffHotelModules();
  const [hotel, setHotel] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  useEffect(() => {
    if (!hotel && hotels?.length) setHotel(hotels[0].id);
  }, [hotel, hotels]);
  const { data, error } = useHotelActivity(hotel, days);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/today" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Activity className="h-5 w-5 text-info" /> {t("Actividad y consumo")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "Uso de la IA, envíos a la administración y al huésped, almacenamiento y últimos errores.",
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t("Últimos 7 días")}</SelectItem>
              <SelectItem value="30">{t("Últimos 30 días")}</SelectItem>
              <SelectItem value="90">{t("Últimos 90 días")}</SelectItem>
            </SelectContent>
          </Select>
          {hotels && hotels.length > 1 && (
            <Select value={hotel ?? undefined} onValueChange={setHotel}>
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
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("Inteligencia artificial")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.ai.length === 0 ? (
                <p className="px-6 pb-2 text-sm text-muted-foreground">
                  {t("Sin uso en este periodo.")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[40rem] text-sm">
                    <thead className="border-y bg-muted/30">
                      <tr>
                        <th className="p-3 text-left">{t("Uso")}</th>
                        <th className="p-3 text-right">{t("Turnos")}</th>
                        <th className="p-3 text-right">{t("Tokens (entrada / salida)")}</th>
                        <th className="p-3 text-right">{t("Coste")}</th>
                        <th className="p-3 text-right">{t("Respuesta (mediana / p95)")}</th>
                        <th className="p-3 text-right">{t("Errores")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ai.map((a) => (
                        <tr key={a.channel} className="border-b last:border-0">
                          <td className="p-3">{CHANNEL_LABELS[a.channel] ?? a.channel}</td>
                          <td className="p-3 text-right tabular-nums">{n(a.turns)}</td>
                          <td className="p-3 text-right tabular-nums">
                            {n(a.input_tokens)} / {n(a.output_tokens)}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {Number(a.cost_usd).toLocaleString(currentLocale(), {
                              style: "currency",
                              currency: "USD",
                            })}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {secs(a.p50_ms)} / {secs(a.p95_ms)}
                          </td>
                          <td
                            className={`p-3 text-right tabular-nums ${a.errors ? "text-destructive" : ""}`}
                          >
                            {n(a.errors)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="px-6 py-3 text-xs text-muted-foreground">
                {t("Llamadas de asistentes externos por MCP:")} {n(data.mcp_calls)}
                {t(
                  ". El coste es el que informa el proveedor del modelo (0 con el modelo local de la demo).",
                )}
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {QUEUES.map((q) => {
              const entries = Object.entries(data.queues[q.key] ?? {}).sort((a, b) => b[1] - a[1]);
              const attention = entries.some(([s, c]) => ATTENTION.has(s) && c > 0);
              return (
                <Card key={q.key} className={attention ? "border-destructive/50" : undefined}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-1.5 text-sm">
                      {attention && <AlertTriangle className="h-4 w-4 text-destructive" />}
                      {t(q.label)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-0.5 text-sm">
                    {entries.length === 0 ? (
                      <p className="text-muted-foreground">{t("Nada en este periodo")}</p>
                    ) : (
                      entries.map(([s, c]) => (
                        <p
                          key={s}
                          className={`flex justify-between ${ATTENTION.has(s) ? "text-destructive" : ""}`}
                        >
                          <span>{STATUS[s] ?? s}</span>
                          <span className="tabular-nums">{n(c)}</span>
                        </p>
                      ))
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t("Almacenamiento")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-0.5 text-sm">
                <p className="flex justify-between">
                  <span>{t("Fotos de la web")}</span>
                  <span className="tabular-nums">{bytes(Number(data.storage.media_bytes))}</span>
                </p>
                <p className="flex justify-between">
                  <span>{t("Data lake")}</span>
                  <span className="tabular-nums">{bytes(Number(data.storage.lake_bytes))}</span>
                </p>
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t("Últimos errores")}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {data.errors.length === 0 ? (
                  <p className="text-muted-foreground">{t("Ninguno. Todo en orden.")}</p>
                ) : (
                  <ul className="space-y-2">
                    {data.errors.map((e, i) => (
                      <li key={i}>
                        <span className="text-xs text-muted-foreground">
                          {new Date(e.at).toLocaleString(currentLocale(), {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}{" "}
                          · {e.source}
                        </span>
                        <p className="break-words">{e.message}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
