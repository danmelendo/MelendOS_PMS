import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { DemoAccountPicker } from "@/components/DemoAccountPicker";
import { DEMO_ACCESS } from "@/lib/demo-access";
import { useAssurance, useRefreshMfa } from "@/lib/mfa";
import { MfaCodeForm } from "@/components/MfaCodeForm";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { session, loading, signIn, signOut } = useAuth();
  const aal = useAssurance(!!session);
  const refreshMfa = useRefreshMfa();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState(false);

  if (loading || (session && aal.isLoading)) return null;
  // Signed in with the password but with two-step verification on: the code.
  const needsCode = !!session && !!aal.data?.needsCode;
  if (session && !needsCode) return <Navigate to="/today" />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) {
      toast.error(error);
    } else {
      // The session decides: straight to the panel, or the code first.
      refreshMfa();
    }
  };

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    // Same answer whether the account exists or not.
    setSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src="/brand/isologo.png" alt="" className="mx-auto mb-2 h-14 w-14" />
          <CardTitle>Melend/OS · Recepción</CardTitle>
          <CardDescription>Accede al panel interno</CardDescription>
        </CardHeader>
        <CardContent>
          {needsCode ? (
            <MfaCodeForm
              onVerified={() => {
                refreshMfa();
                navigate({ to: "/today" });
              }}
              onCancel={() => void signOut()}
            />
          ) : DEMO_ACCESS ? (
            <DemoAccountPicker
              kind="staff"
              tone="panel"
              onSignedIn={() => navigate({ to: "/today" })}
            />
          ) : forgot ? (
            sent ? (
              <div className="space-y-4 text-sm">
                <p>
                  Si <strong>{email}</strong> tiene cuenta, te llegará un email con un enlace para
                  elegir una contraseña nueva. Revisa también el correo no deseado.
                </p>
                <Button variant="outline" className="w-full" onClick={() => setForgot(false)}>
                  Volver
                </Button>
              </div>
            ) : (
              <form onSubmit={sendReset} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Escribe tu email y te enviaremos un enlace para elegir una contraseña nueva.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "..." : "Enviar enlace"}
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-xs text-muted-foreground hover:underline"
                  onClick={() => setForgot(false)}
                >
                  Volver a entrar
                </button>
              </form>
            )
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "..." : "Entrar"}
              </Button>
              <button
                type="button"
                className="w-full text-center text-xs text-muted-foreground hover:underline"
                onClick={() => {
                  setSent(false);
                  setForgot(true);
                }}
              >
                ¿Has olvidado la contraseña?
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
