import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { DEMO_ACCESS } from "@/lib/demo-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Landing page of the password-recovery email (and of an invitation): the
// link signs the user in for this purpose only; here they choose a password.

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  // Where to go afterwards: the panel, or the guest area of the booking web.
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next: s.next === "/web/mi-reserva" ? s.next : undefined,
  }),
});

const MIN_LENGTH = 10;

/**
 * True when the session comes from a recovery or invitation link opened in
 * the last 15 minutes (the JWT's amr claim), not from an ordinary sign-in: a
 * computer left unattended must not let anyone change the password.
 */
function fromRecoveryLink(accessToken: string): boolean {
  try {
    const payload = JSON.parse(
      atob(accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as { amr?: { method: string; timestamp: number }[] };
    const now = Date.now() / 1000;
    return (payload.amr ?? []).some(
      (a) => ["recovery", "invite", "otp"].includes(a.method) && now - a.timestamp < 15 * 60,
    );
  } catch {
    return false;
  }
}

function ResetPasswordPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  // The session from the link arrives a moment after the page loads.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(t);
  }, []);

  const problem =
    password.length < MIN_LENGTH
      ? `Mínimo ${MIN_LENGTH} caracteres`
      : password !== repeat
        ? "Las contraseñas no coinciden"
        : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problem) return toast.error(problem);
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Contraseña guardada");
    navigate({ to: next ?? "/today" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src="/brand/isologo.png" alt="" className="mx-auto mb-2 h-14 w-14" />
          <CardTitle>Nueva contraseña</CardTitle>
          <CardDescription>
            Elige la contraseña con la que entrarás a partir de ahora
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading || (!session && !waited) ? (
            <p className="text-center text-sm text-muted-foreground">Comprobando el enlace…</p>
          ) : DEMO_ACCESS ? (
            <p className="text-center text-sm text-muted-foreground">
              En la demo las cuentas son compartidas y no se cambian sus contraseñas.
            </p>
          ) : !session || !fromRecoveryLink(session.access_token) ? (
            <div className="space-y-4 text-center text-sm">
              <p>El enlace ha caducado o ya se usó. Pide otro desde la pantalla de acceso.</p>
              <Button className="w-full" onClick={() => navigate({ to: "/login" })}>
                Ir al acceso
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-sm text-muted-foreground">{session.user.email}</p>
              <div className="space-y-2">
                <Label htmlFor="new-password">Contraseña nueva</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={MIN_LENGTH}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="repeat-password">Repítela</Label>
                <Input
                  id="repeat-password"
                  type="password"
                  required
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy || !!problem}>
                {busy ? "Guardando…" : "Guardar y entrar"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
