import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyCode } from "@/lib/mfa";

/** Second step of signing in: the code of the authenticator app. */
export function MfaCodeForm({
  onVerified,
  onCancel,
}: {
  onVerified: () => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const err = await verifyCode(code);
        setBusy(false);
        if (err) setError(err);
        else onVerified();
      }}
    >
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        Escribe el código de 6 cifras de tu app de verificación.
      </p>
      <div className="space-y-2">
        <Label htmlFor="mfa-code">Código</Label>
        <Input
          id="mfa-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={7}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          className="font-mono tracking-widest"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={busy || code.replace(/\s/g, "").length < 6}
      >
        {busy ? "Comprobando…" : "Verificar"}
      </Button>
      <button
        type="button"
        className="w-full text-center text-xs text-muted-foreground hover:underline"
        onClick={onCancel}
      >
        Cerrar sesión
      </button>
    </form>
  );
}
