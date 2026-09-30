import { useState } from "react";
import { KeyRound, Lock } from "lucide-react";
import { toast } from "sonner";
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
import { useInvoiceActions, type FiscalSettings } from "@/lib/invoices";
import { t } from "@/lib/i18n";

const ENVIRONMENTS: Record<FiscalSettings["environment"], string> = {
  simulated: "Simulado (no sale del PMS)",
  pre: "Pruebas de la AEAT",
  prod: "Producción (AEAT)",
};

export function FiscalSettingsCard({
  settings,
  actions,
}: {
  settings: FiscalSettings | null;
  actions: ReturnType<typeof useInvoiceActions>;
}) {
  const locked = !!settings?.enabled && settings.environment === "prod";
  const [f, setF] = useState({
    enabled: settings?.enabled ?? false,
    environment: settings?.environment ?? "simulated",
    issuer_nif: settings?.issuer_nif ?? "",
    issuer_name: settings?.issuer_name ?? "",
    issuer_address: settings?.issuer_address ?? "",
    simplified_limit: String(settings?.simplified_limit ?? 400),
  });
  const [cert, setCert] = useState({ cert: "", key: "" });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("Configuración fiscal")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(
            "Datos del emisor de las facturas y certificado electrónico con el que el PMS se identifica ante la AEAT.",
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        {locked && (
          <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />{" "}
            {t(
              "VERI*FACTU está en producción: no se desactiva ni se cambia de entorno desde el panel (la norma no permite usar el sistema a voluntad).",
            )}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-3">
            <Switch
              checked={f.enabled}
              disabled={locked}
              onCheckedChange={(v) => setF({ ...f, enabled: v })}
            />

            {t("Facturar con VERI*FACTU")}
          </label>
          <div className="space-y-1">
            <Label>{t("Entorno")}</Label>
            <Select
              value={f.environment}
              disabled={locked}
              onValueChange={(v) => setF({ ...f, environment: v as FiscalSettings["environment"] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ENVIRONMENTS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fs-nif">{t("NIF del emisor")}</Label>
            <Input
              id="fs-nif"
              className="font-mono uppercase"
              maxLength={9}
              value={f.issuer_nif}
              onChange={(e) => setF({ ...f, issuer_nif: e.target.value.trim().toUpperCase() })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fs-name">{t("Razón social")}</Label>
            <Input
              id="fs-name"
              maxLength={120}
              value={f.issuer_name}
              onChange={(e) => setF({ ...f, issuer_name: e.target.value })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="fs-addr">{t("Domicilio fiscal (sale en la factura)")}</Label>
            <Input
              id="fs-addr"
              maxLength={200}
              value={f.issuer_address}
              onChange={(e) => setF({ ...f, issuer_address: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fs-limit">{t("Límite de la factura simplificada (€)")}</Label>
            <Input
              id="fs-limit"
              inputMode="decimal"
              value={f.simplified_limit}
              onChange={(e) => setF({ ...f, simplified_limit: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "400 € con carácter general; hasta 3.000 € según la actividad (consúltalo con tu gestoría).",
              )}
            </p>
          </div>
          {settings?.installation_number && (
            <div className="space-y-1">
              <Label>{t("Número de instalación")}</Label>
              <p className="font-mono text-xs">{settings.installation_number}</p>
            </div>
          )}
        </div>
        <Button
          disabled={actions.saveSettings.isPending}
          onClick={() =>
            actions.saveSettings.mutate(
              { ...f, simplified_limit: Number(f.simplified_limit.replace(",", ".")) || 400 },
              {
                onSuccess: () => toast.success(t("Configuración guardada")),
                onError: (e) => toast.error(t(e.message)),
              },
            )
          }
        >
          {t("Guardar configuración")}
        </Button>

        <div className="space-y-3 border-t pt-4">
          <p className="flex items-center gap-2 font-medium">
            <KeyRound className="h-4 w-4" /> {t("Certificado electrónico")}
            {settings?.has_certificate && (
              <Badge variant="secondary" className="font-normal">
                {t("Guardado")}
              </Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              "Certificado cualificado del hotel (o de su representante) en formato PEM. Si lo tienes en .p12/.pfx:",
            )}{" "}
            <code className="rounded bg-muted px-1">
              {t("openssl pkcs12 -in cert.p12 -clcerts -nokeys")}
            </code>{" "}
            {t("para el certificado y")}{" "}
            <code className="rounded bg-muted px-1">
              {t("openssl pkcs12 -in cert.p12 -nocerts -nodes")}
            </code>{" "}
            {t("para la clave. Se guarda cifrado y solo lo usa el servidor.")}
          </p>
          <textarea
            className="min-h-20 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
            placeholder={t("-----BEGIN CERTIFICATE-----")}
            value={cert.cert}
            onChange={(e) => setCert({ ...cert, cert: e.target.value })}
          />
          <textarea
            className="min-h-20 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
            placeholder={t("-----BEGIN PRIVATE KEY-----")}
            value={cert.key}
            onChange={(e) => setCert({ ...cert, key: e.target.value })}
          />
          <Button
            variant="outline"
            disabled={!cert.cert.trim() || !cert.key.trim() || actions.saveCertificate.isPending}
            onClick={() =>
              actions.saveCertificate.mutate(cert, {
                onSuccess: () => {
                  toast.success(t("Certificado guardado"));
                  setCert({ cert: "", key: "" });
                },
                onError: (e) => toast.error(t(e.message)),
              })
            }
          >
            {t("Guardar certificado")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
