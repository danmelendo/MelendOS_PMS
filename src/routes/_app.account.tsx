import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { DEMO_ACCESS } from "@/lib/demo-access";
import { useFactors, useRefreshMfa } from "@/lib/mfa";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/_app/account")({
  component: AccountPage,
});

function AccountPage() {
  const { user } = useAuth();
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <UserRound className="h-5 w-5 text-info" /> {t("Mi cuenta")}
      </h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" /> {t("Contraseña")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {t("Por seguridad, la contraseña se cambia desde un enlace que te enviamos a")}{" "}
            <strong>{user?.email}</strong>.
          </p>
          <Button
            variant="outline"
            disabled={DEMO_ACCESS}
            onClick={async () => {
              await supabase.auth.resetPasswordForEmail(user!.email!, {
                redirectTo: `${window.location.origin}/reset-password`,
              });
              toast.success(t("Te hemos enviado el enlace"));
            }}
          >
            {t("Enviarme el enlace")}
          </Button>
          {DEMO_ACCESS && (
            <p className="text-xs text-muted-foreground">
              {t("En la demo las cuentas son compartidas y no se cambian.")}
            </p>
          )}
        </CardContent>
      </Card>
      <TwoStep />
    </div>
  );
}

function TwoStep() {
  const { data: factors, isLoading } = useFactors();
  const refresh = useRefreshMfa();
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(
    null,
  );
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const active = factors?.find((f) => f.status === "verified");

  const start = async () => {
    setBusy(true);
    // Leftovers of an enrolment that was never finished.
    for (const f of factors ?? []) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Melend/OS ${new Date().toISOString().slice(0, 16)}`,
    });
    setBusy(false);
    if (error) return toast.error(t(error.message));
    setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const confirm = async () => {
    if (!enrolling) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrolling.id,
      code: code.replace(/\s/g, ""),
    });
    setBusy(false);
    if (error) return toast.error(t("Código incorrecto. Prueba con el siguiente."));
    toast.success(t("Verificación en dos pasos activada"));
    setEnrolling(null);
    setCode("");
    refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" /> {t("Verificación en dos pasos")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(
            "Además de la contraseña, al entrar se pide un código de una app del móvil (Google Authenticator, Microsoft Authenticator, 1Password…). Muy recomendable si eres de dirección: das acceso a datos de clientes, tarifas y facturación.",
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {DEMO_ACCESS ? (
          <p className="text-muted-foreground">
            {t("No disponible en la demo: las cuentas son compartidas.")}
          </p>
        ) : isLoading ? null : active ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-medium text-emerald-700">{t("Activada")}</span>
            {confirmOff ? (
              <span className="flex items-center gap-2">
                <span className="text-xs">{t("¿Desactivarla?")}</span>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const { error } = await supabase.auth.mfa.unenroll({ factorId: active.id });
                    setBusy(false);
                    setConfirmOff(false);
                    if (error) return toast.error(t(error.message));
                    toast.success(t("Verificación en dos pasos desactivada"));
                    refresh();
                  }}
                >
                  {t("Desactivar")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmOff(false)}>
                  {t("No")}
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirmOff(true)}>
                {t("Desactivar")}
              </Button>
            )}
          </div>
        ) : enrolling ? (
          <div className="space-y-4">
            <p>{t("1. Escanea este código con tu app de verificación:")}</p>
            <img
              src={enrolling.qr}
              alt={t("Código QR para la app de verificación")}
              className="h-44 w-44 rounded border bg-white p-2"
            />
            <p className="text-xs text-muted-foreground">
              {t("¿No puedes escanearlo? Escribe esta clave en la app:")}{" "}
              <span className="font-mono">{enrolling.secret}</span>
            </p>
            <div className="space-y-2">
              <Label htmlFor="enroll-code">
                {t("2. Escribe el código de 6 cifras que muestra")}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="enroll-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-40 font-mono tracking-widest"
                />
                <Button disabled={busy || code.replace(/\s/g, "").length < 6} onClick={confirm}>
                  {t("Activar")}
                </Button>
                <Button variant="ghost" onClick={() => setEnrolling(null)}>
                  {t("Cancelar")}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Button onClick={start} disabled={busy}>
            {t("Activar la verificación en dos pasos")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
