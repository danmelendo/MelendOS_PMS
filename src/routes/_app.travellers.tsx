import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, FlaskConical, RotateCcw, Send, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { ymdInZone } from "@domain/dates.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TravellersDrawer, type StayRef } from "@/components/TravellersDrawer";
import { useStaffHotelModules } from "@/lib/features";
import { useRoles } from "@/lib/roles";
import {
  OPEN,
  SES_STATUS,
  useSesActions,
  useSesQueue,
  useSesSettings,
  type SesCommunication,
} from "@/lib/ses";
import { t, currentLocale } from "@/lib/i18n";

export const Route = createFileRoute("/_app/travellers")({
  component: TravellersPage,
});

const KIND: Record<string, string> = {
  RHA: "Reserva",
  RHB: "Anulación de reserva",
  PVA: "Parte de viajeros",
  PVB: "Anulación de parte",
};

const TONE: Record<string, string> = {
  muted: "bg-muted text-muted-foreground",
  info: "bg-info/15 text-info-foreground",
  ok: "bg-emerald-100 text-emerald-800",
  warn: "bg-gold/20 text-gold-foreground",
  bad: "bg-destructive/15 text-destructive",
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(currentLocale(), { day: "numeric", month: "short" });

/** "vence en 5 h" / "vencida hace 2 h" for what is still open. */
function deadline(c: SesCommunication): { text: string; late: boolean } | null {
  if (!["pending", "blocked", "error", "rejected"].includes(c.status)) return null;
  const h = Math.round((Date.parse(c.due_at) - Date.now()) / 3_600_000);
  if (h >= 0) return { text: h < 1 ? "vence en menos de 1 h" : `vence en ${h} h`, late: false };
  return { text: `vencida hace ${-h} h`, late: true };
}

function TravellersPage() {
  const { isAdmin, canOperate, loading } = useRoles();
  const { data: hotels } = useStaffHotelModules();
  const [hotel, setHotel] = useState<string | null>(null);
  useEffect(() => {
    if (!hotel && hotels?.length) setHotel(hotels[0].id);
  }, [hotel, hotels]);
  const [scope, setScope] = useState<"open" | "all">("open");
  const { data: rows } = useSesQueue(hotel, scope);
  const { data: setup } = useSesSettings(hotel);
  const actions = useSesActions(hotel);
  const [stay, setStay] = useState<StayRef | null>(null);

  if (loading) return null;
  const settings = setup?.settings;
  const openRows = (rows ?? []).filter((r) => OPEN.includes(r.status));
  const late = openRows.filter((r) => deadline(r)?.late).length;
  const problems = openRows.filter((r) =>
    ["blocked", "rejected", "error"].includes(r.status),
  ).length;

  const openStay = (c: SesCommunication) =>
    c.reservation &&
    setStay({
      id: c.reservation_id,
      reference: c.reservation.reference,
      guestName: c.reservation.customer?.name ?? null,
      checkIn: ymdInZone(c.reservation.start_at, "Europe/Madrid"),
      people: c.reservation.people,
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ShieldCheck className="h-5 w-5 text-info" /> {t("Registro de viajeros")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "Comunicaciones al Ministerio del Interior (SES.HOSPEDAJES): cada reserva y el parte de viajeros de cada entrada, en menos de 24 horas.",
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
          {settings?.enabled && canOperate && (
            <Button
              disabled={actions.dispatch.isPending}
              onClick={() =>
                actions.dispatch.mutate(undefined, {
                  onSuccess: (r) =>
                    toast.success(
                      `Enviadas ${r.sent} · registradas ${r.accepted}` +
                        (r.blocked ? ` · ${r.blocked} con datos pendientes` : "") +
                        (r.rejected ? ` · ${r.rejected} rechazadas` : ""),
                    ),
                  onError: (e) => toast.error(t(e.message)),
                })
              }
            >
              <Send className="h-4 w-4" />
              {actions.dispatch.isPending ? t("Enviando…") : t("Enviar ahora")}
            </Button>
          )}
        </div>
      </div>

      {settings?.enabled && settings.environment !== "prod" && (
        <p className="flex items-start gap-2 rounded-md bg-gold/15 px-3 py-2 text-sm text-gold-foreground">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
          {settings.environment === "simulated"
            ? t(
                "Modo simulado: el PMS prepara y valida cada comunicación como para el ministerio, pero no la envía. Cambia a producción cuando tengas las credenciales de la Sede Electrónica.",
              )
            : t(
                "Entorno de pruebas del ministerio: las comunicaciones no cuentan como registradas.",
              )}
        </p>
      )}

      {setup && !settings?.enabled && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {t("El registro de viajeros no está activado en este hotel.")}
            {isAdmin ? (
              <>
                {" "}
                <Link to="/settings/travellers" className="font-medium text-foreground underline">
                  {t("Activarlo")}
                </Link>
              </>
            ) : (
              t(" Pídeselo a dirección.")
            )}
          </CardContent>
        </Card>
      )}

      {settings?.enabled && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label={t("Pendientes")} value={openRows.length} />
            <Stat label={t("Vencidas (más de 24 h)")} value={late} alert={late > 0} />
            <Stat label={t("Necesitan revisión")} value={problems} alert={problems > 0} />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">{t("Comunicaciones")}</CardTitle>
              <div className="flex gap-1 text-sm">
                {(["open", "all"] as const).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={scope === s ? "secondary" : "ghost"}
                    onClick={() => setScope(s)}
                  >
                    {s === "open" ? t("Pendientes") : t("Últimos 30 días")}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {!rows?.length ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  {scope === "open"
                    ? t("Todo al día: no hay nada pendiente.")
                    : t("Sin comunicaciones.")}
                </p>
              ) : (
                <div className="divide-y">
                  {rows.map((c) => (
                    <Row
                      key={c.id}
                      c={c}
                      canOperate={canOperate}
                      onTravellers={() => openStay(c)}
                      onRetry={() =>
                        actions.retry.mutate(c.id, {
                          onSuccess: () => toast.success(t("Se reenviará en el próximo envío")),
                          onError: (e) => toast.error(t(e.message)),
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {isAdmin && settings?.enabled && (
        <p className="text-sm text-muted-foreground">
          {t("Credenciales, entorno y códigos de establecimiento:")}{" "}
          <Link to="/settings/travellers" className="font-medium text-foreground underline">
            {t("Configuración → SES.HOSPEDAJES")}
          </Link>
        </p>
      )}

      <TravellersDrawer
        stay={stay}
        readOnly={!canOperate}
        onOpenChange={(o) => !o && setStay(null)}
      />
    </div>
  );
}

function Stat({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold tabular-nums ${alert ? "text-destructive" : ""}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function Row({
  c,
  canOperate,
  onTravellers,
  onRetry,
}: {
  c: SesCommunication;
  canOperate: boolean;
  onTravellers: () => void;
  onRetry: () => void;
}) {
  const st = SES_STATUS[c.status];
  const due = deadline(c);
  const r = c.reservation;
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-6 py-3 text-sm">
      <div className="min-w-0 flex-1 basis-64">
        <p className="font-medium">
          {t(KIND[c.kind + c.operation])}{" "}
          <span className="font-mono text-xs text-muted-foreground">{r?.reference}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {r?.customer?.name ?? t("Sin nombre")}
          {r ? ` · ${r.room?.name ?? ""} · ${shortDate(r.start_at)}–${shortDate(r.end_at)}` : ""}
        </p>
        {c.error && ["blocked", "rejected", "error"].includes(c.status) && (
          <p className="mt-1 flex items-start gap-1 text-xs text-gold-foreground">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {c.error}
          </p>
        )}
        {c.ses_code && (
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {t("Código:")} {c.ses_code}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge className={`${TONE[st.tone]} border-0`}>{t(st.label)}</Badge>
        {due && (
          <span
            className={`text-xs ${due.late ? "font-medium text-destructive" : "text-muted-foreground"}`}
          >
            {due.text}
          </span>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        <Button size="sm" variant="outline" onClick={onTravellers}>
          <Users className="h-4 w-4" /> {t("Viajeros")}
        </Button>
        {canOperate && ["rejected", "error"].includes(c.status) && (
          <Button size="sm" variant="ghost" onClick={onRetry}>
            <RotateCcw className="h-4 w-4" /> {t("Reenviar")}
          </Button>
        )}
      </div>
    </div>
  );
}
