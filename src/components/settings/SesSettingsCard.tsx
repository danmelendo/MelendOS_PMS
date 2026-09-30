import { useState } from "react";
import { KeyRound } from "lucide-react";
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
import { useSesActions, type SesSettings } from "@/lib/ses";

const ENVIRONMENTS: Record<SesSettings["environment"], string> = {
  simulated: "Simulado (no sale del PMS)",
  pre: "Pruebas del ministerio",
  prod: "Producción",
};

export function SesSettingsCard({
  settings,
  establishments,
  properties,
  actions,
}: {
  settings: SesSettings | null;
  establishments: Record<string, string>;
  properties: { id: string; name: string }[];
  actions: ReturnType<typeof useSesActions>;
}) {
  const [form, setForm] = useState({
    enabled: settings?.enabled ?? false,
    environment: settings?.environment ?? "simulated",
    landlord_code: settings?.landlord_code ?? "",
    app_name: settings?.app_name ?? "Demo Stays PMS",
    establishments: { ...establishments },
  });
  const [creds, setCreds] = useState({ user: "", password: "", caCert: "" });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Conexión con el ministerio</CardTitle>
        <p className="text-sm text-muted-foreground">
          Los códigos y las credenciales se obtienen al dar de alta la empresa y sus
          establecimientos en la Sede Electrónica del Ministerio del Interior
          (hospedajes.ses.mir.es).
        </p>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-3">
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            />
            Comunicar reservas y partes de viajeros
          </label>
          <div className="space-y-1">
            <Label>Entorno</Label>
            <Select
              value={form.environment}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, environment: v as SesSettings["environment"] }))
              }
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
            <Label htmlFor="ses-landlord">Código de arrendador</Label>
            <Input
              id="ses-landlord"
              className="font-mono"
              maxLength={10}
              value={form.landlord_code}
              onChange={(e) => setForm((f) => ({ ...f, landlord_code: e.target.value.trim() }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ses-app">Nombre de la aplicación</Label>
            <Input
              id="ses-app"
              maxLength={50}
              value={form.app_name}
              onChange={(e) => setForm((f) => ({ ...f, app_name: e.target.value }))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="font-medium">Código de establecimiento</p>
          {properties.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="w-48 shrink-0 truncate">{p.name}</span>
              <Input
                className="h-8 font-mono text-xs"
                maxLength={10}
                placeholder="Sin registrar"
                value={form.establishments[p.id] ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    establishments: { ...f.establishments, [p.id]: e.target.value.trim() },
                  }))
                }
              />
            </div>
          ))}
        </div>

        <Button
          disabled={actions.saveSettings.isPending}
          onClick={() =>
            actions.saveSettings.mutate(
              {
                ...form,
                establishments: Object.fromEntries(
                  properties.map((p) => [p.id, form.establishments[p.id] ?? ""]),
                ),
              },
              {
                onSuccess: () => toast.success("Configuración guardada"),
                onError: (e) => toast.error(e.message),
              },
            )
          }
        >
          Guardar configuración
        </Button>

        <div className="space-y-3 border-t pt-4">
          <p className="flex items-center gap-2 font-medium">
            <KeyRound className="h-4 w-4" /> Credenciales del servicio web
            {settings?.has_credentials && (
              <Badge variant="secondary" className="font-normal">
                Guardadas
              </Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Se guardan cifradas y solo las usa el servidor; nadie puede volver a verlas. Guardarlas
            de nuevo las sustituye.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              placeholder="Usuario"
              autoComplete="off"
              value={creds.user}
              onChange={(e) => setCreds((c) => ({ ...c, user: e.target.value }))}
            />
            <Input
              type="password"
              placeholder="Contraseña"
              autoComplete="new-password"
              value={creds.password}
              onChange={(e) => setCreds((c) => ({ ...c, password: e.target.value }))}
            />
          </div>
          <textarea
            className="min-h-20 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
            placeholder="Certificado del servicio (PEM), solo si el ministerio lo exige"
            value={creds.caCert}
            onChange={(e) => setCreds((c) => ({ ...c, caCert: e.target.value }))}
          />
          <Button
            variant="outline"
            disabled={!creds.user || !creds.password || actions.saveCredentials.isPending}
            onClick={() =>
              actions.saveCredentials.mutate(creds, {
                onSuccess: () => {
                  toast.success("Credenciales guardadas");
                  setCreds({ user: "", password: "", caCert: "" });
                },
                onError: (e) => toast.error(e.message),
              })
            }
          >
            Guardar credenciales
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
