import { useEffect, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, KeyRound, Network, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { bookingReference } from "@domain/reference.ts";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ModuleOff } from "@/components/ModuleOff";
import {
  CHANNEL_KINDS,
  CHANNEL_PROVIDERS,
  useChannelActions,
  useChannelActivity,
  useChannels,
  webhookUrl,
  type Channel,
  type ChannelKind,
  type ChannelProvider,
} from "@/lib/channels";
import { eur } from "@/lib/data";
import { DEMO_ACCESS } from "@/lib/demo-access";
import { useHotelsWith } from "@/lib/features";
import { useRoles } from "@/lib/roles";
import { PlatformOnly } from "@/components/settings/AdminOnly";
import { t, currentLocale } from "@/lib/i18n";

export const Route = createFileRoute("/_app/channels")({
  component: () => (
    <PlatformOnly>
      <ChannelsPage />
    </PlatformOnly>
  ),
});

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(currentLocale(), {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/** "Doble Estándar" → "DOBLE-ESTANDAR": default code of a room type on a channel. */
const codeOf = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();

function useRoomTypes(tenantId: string | null) {
  return useQuery({
    queryKey: ["rate-groups-with-rooms", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const [{ data: groups }, { data: rooms }] = await Promise.all([
        supabase.from("rate_groups").select("id, name").eq("tenant_id", tenantId!).order("name"),
        supabase
          .from("rooms")
          .select("rate_group_id")
          .eq("tenant_id", tenantId!)
          .eq("active", true),
      ]);
      const used = new Set((rooms ?? []).map((r) => r.rate_group_id));
      return (groups ?? []).filter((g) => used.has(g.id));
    },
  });
}

function RoomMapEditor({
  channel,
  types,
  onSave,
}: {
  channel: Channel;
  types: { id: string; name: string }[];
  onSave: (map: Record<string, string>) => void;
}) {
  const byGroup = Object.fromEntries(Object.entries(channel.room_map).map(([c, g]) => [g, c]));
  const [codes, setCodes] = useState<Record<string, string>>(
    Object.fromEntries(types.map((t) => [t.id, byGroup[t.id] ?? ""])),
  );
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {t("Código de cada tipo de habitación en el canal (vacío = no se vende en este canal).")}
      </p>
      {types.map((rt) => (
        <div key={rt.id} className="flex items-center gap-2">
          <span className="w-40 shrink-0 truncate text-sm">{rt.name}</span>
          <Input
            className="h-8 font-mono text-xs"
            value={codes[rt.id] ?? ""}
            placeholder={t("Sin vender")}
            onChange={(e) => setCodes((c) => ({ ...c, [rt.id]: e.target.value.toUpperCase() }))}
          />
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          onSave(
            Object.fromEntries(
              Object.entries(codes)
                .filter(([, c]) => c.trim())
                .map(([g, c]) => [c.trim(), g]),
            ),
          )
        }
      >
        {t("Guardar códigos")}
      </Button>
    </div>
  );
}

// Distribution: OTAs, channel managers and tour operators. Bookings come in by
// a signed webhook; availability goes out through a queue; everything is logged.
function ChannelsPage() {
  const { isAdmin, loading } = useRoles();
  const { data: hotels } = useHotelsWith("channels");
  const [hotel, setHotel] = useState<string | null>(null);
  useEffect(() => {
    if (!hotel && hotels?.length) setHotel(hotels[0].id);
  }, [hotel, hotels]);

  const { data: channels } = useChannels(hotel);
  const { data: activity } = useChannelActivity(hotel);
  const { data: types } = useRoomTypes(hotel);
  const actions = useChannelActions(hotel);

  const [form, setForm] = useState({
    name: "",
    kind: "ota" as ChannelKind,
    provider: "demo" as ChannelProvider,
    commission: "15",
  });
  const [created, setCreated] = useState<{ id: string; secret: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/today" />;
  if (hotels && hotels.length === 0) return <ModuleOff feature="channels" hotel="tus hoteles" />;

  const nameOf = (id: string) => channels?.find((c) => c.id === id)?.name ?? "—";

  const create = () => {
    const roomMap = Object.fromEntries((types ?? []).map((t) => [codeOf(t.name), t.id]));
    actions.create.mutate(
      {
        kind: form.kind,
        provider: form.provider,
        name: form.name.trim() || CHANNEL_PROVIDERS[form.provider],
        commission: Number(form.commission) || 0,
        roomMap,
      },
      {
        onSuccess: (c) => {
          setCreated(c);
          setForm((f) => ({ ...f, name: "" }));
        },
        onError: (e) => toast.error(t(e.message)),
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Network className="h-5 w-5 text-info" /> {t("Canales")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "OTAs, channel managers y touroperadores: sus reservas entran en el PMS y reciben tu disponibilidad.",
            )}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {hotels && hotels.length > 1 && (
            <Select value={hotel ?? undefined} onValueChange={setHotel}>
              <SelectTrigger className="min-w-0 flex-1 sm:w-52 sm:flex-none">
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
          <Button
            variant="outline"
            disabled={actions.dispatch.isPending}
            onClick={() =>
              actions.dispatch.mutate(undefined, {
                onSuccess: (r) =>
                  toast.success(
                    r.processed
                      ? `Disponibilidad enviada (${r.sent} cambios${r.failed ? `, ${r.failed} con error` : ""})`
                      : "No había cambios pendientes",
                  ),
                onError: (e) => toast.error(t(e.message)),
              })
            }
          >
            <Send className="mr-1 h-4 w-4" /> {t("Enviar disponibilidad")}
            {activity?.pending ? ` (${activity.pending})` : ""}
          </Button>
        </div>
      </div>

      {created ? (
        <Card className="border-gold/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-gold" /> {t("Datos para configurar el canal")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t(
                "El secreto no se volverá a mostrar. El canal firma cada envío con él (cabecera X-Signature, HMAC-SHA256 del cuerpo).",
              )}
            </p>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">{t("URL de reservas (webhook)")}</div>
              <code className="block overflow-x-auto rounded bg-muted px-2 py-1 text-xs">
                {webhookUrl(created.id)}
              </code>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("Secreto de firma")}</div>
              <code className="block overflow-x-auto rounded bg-muted px-2 py-1 text-xs">
                {created.secret}
              </code>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setCreated(null)}>{t("Ya lo he guardado")}</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("Conectar un canal")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto]">
            <div className="space-y-1">
              <Label htmlFor="ch-name">{t("Nombre")}</Label>
              <Input
                id="ch-name"
                maxLength={80}
                placeholder={t("Booking.com, Viajes Sol…")}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("Tipo")}</Label>
              <Select
                value={form.kind}
                onValueChange={(v) => setForm((f) => ({ ...f, kind: v as ChannelKind }))}
              >
                <SelectTrigger className="sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CHANNEL_KINDS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {t(v)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("Proveedor")}</Label>
              <Select
                value={form.provider}
                onValueChange={(v) => setForm((f) => ({ ...f, provider: v as ChannelProvider }))}
              >
                <SelectTrigger className="sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CHANNEL_PROVIDERS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {t(v)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ch-fee">{t("Comisión %")}</Label>
              <Input
                id="ch-fee"
                type="number"
                min={0}
                max={60}
                className="sm:w-24"
                value={form.commission}
                onChange={(e) => setForm((f) => ({ ...f, commission: e.target.value }))}
              />
            </div>
            <div className="flex items-end">
              <Button disabled={!hotel || actions.create.isPending} onClick={create}>
                {t("Conectar")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(channels ?? []).map((c) => {
          const stats = activity?.perChannel[c.id];
          return (
            <Card key={c.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
                <div className="min-w-0">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {c.name}
                    <Badge variant="secondary">{t(CHANNEL_KINDS[c.kind])}</Badge>
                    <Badge variant="outline">{t(CHANNEL_PROVIDERS[c.provider])}</Badge>
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("Comisión")} {c.commission_pct} % · {Object.keys(c.room_map).length}{" "}
                    {t("tipos de habitación · último mensaje")} {when(c.last_message_at)}
                  </p>
                </div>
                <Switch
                  checked={c.status === "active"}
                  aria-label={t("Canal {0} activo", { 0: c.name })}
                  onCheckedChange={(on) =>
                    actions.update.mutate({ id: c.id, patch: { status: on ? "active" : "paused" } })
                  }
                />
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">{t("Reservas 30 días")}</div>
                    <div className="font-semibold tabular-nums">{stats?.bookings ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{t("Importe")}</div>
                    <div className="font-semibold tabular-nums">{eur(stats?.revenue ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{t("Comisión")}</div>
                    <div className="font-semibold tabular-nums">{eur(stats?.commission ?? 0)}</div>
                  </div>
                </div>
                {editing === c.id && types ? (
                  <RoomMapEditor
                    channel={c}
                    types={types}
                    onSave={(map) =>
                      actions.update.mutate(
                        { id: c.id, patch: { room_map: map } },
                        {
                          onSuccess: () => {
                            setEditing(null);
                            toast.success(t("Códigos guardados"));
                          },
                          onError: (e) => toast.error(t(e.message)),
                        },
                      )
                    }
                  />
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(editing === c.id ? null : c.id)}
                  >
                    {editing === c.id ? t("Cerrar") : t("Tipos de habitación")}
                  </Button>
                  {DEMO_ACCESS && c.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actions.simulate.isPending}
                      onClick={() =>
                        actions.simulate.mutate(c.id, {
                          onSuccess: (r) =>
                            r.response?.reference
                              ? toast.success(
                                  t("Reserva {0} recibida de {1}", {
                                    0: r.response.reference,
                                    1: c.name,
                                  }),
                                )
                              : toast.error(r.response?.error ?? "No se recibió la reserva"),
                          onError: (e) => toast.error(t(e.message)),
                        })
                      }
                    >
                      <ArrowDownLeft className="mr-1 h-3.5 w-3.5" /> {t("Simular reserva")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() => {
                      if (window.confirm(`¿Desconectar ${c.name}? Sus reservas se conservan.`)) {
                        actions.remove.mutate(c.id, { onError: (e) => toast.error(t(e.message)) });
                      }
                    }}
                  >
                    {t("Desconectar")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {channels && channels.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t("Aún no hay canales conectados. Las reservas de la web propia no necesitan canal.")}
          </p>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">{t("Registro de mensajes")}</CardTitle>
          <RefreshCw className="h-4 w-4 text-muted-foreground" aria-hidden />
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="border-y bg-muted/30">
                <tr>
                  <th className="p-2 pl-4 text-left">{t("Fecha")}</th>
                  <th className="p-2 text-left">{t("Canal")}</th>
                  <th className="p-2 text-left">{t("Mensaje")}</th>
                  <th className="p-2 text-left">{t("Reserva")}</th>
                  <th className="p-2 text-left">{t("Resultado")}</th>
                </tr>
              </thead>
              <tbody>
                {(activity?.messages ?? []).map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="p-2 pl-4 text-xs tabular-nums">{when(m.created_at)}</td>
                    <td className="p-2">{nameOf(m.channel_id)}</td>
                    <td className="p-2">
                      <span className="inline-flex items-center gap-1">
                        {m.direction === "in" ? (
                          <ArrowDownLeft className="h-3.5 w-3.5 text-info" />
                        ) : (
                          <ArrowUpRight className="h-3.5 w-3.5 text-gold" />
                        )}
                        <span className="font-mono text-xs">{m.event}</span>
                      </span>
                    </td>
                    <td className="p-2 font-mono text-xs">
                      {m.reservation_id
                        ? bookingReference(m.reservation_id)
                        : (m.external_ref ?? "—")}
                    </td>
                    <td className="p-2 text-xs">
                      <span className={m.status === "ok" ? "text-info" : "text-destructive"}>
                        {m.status === "ok" ? t("OK") : t("Error")}
                      </span>
                      {m.detail && <span className="ml-1 text-muted-foreground">· {m.detail}</span>}
                    </td>
                  </tr>
                ))}
                {!activity?.messages.length && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      {t("Sin mensajes todavía.")}
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
