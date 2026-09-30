import { useState } from "react";
import { LogIn } from "lucide-react";
import { toast } from "sonner";
import { demoAccounts, demoSignIn } from "@/lib/demo-access";
import { t } from "@/lib/i18n";

/**
 * "Enter as…" for the demo: a list of fictitious accounts instead of a
 * password form. `tone` matches the staff panel or the guest app.
 */
export function DemoAccountPicker({
  kind,
  tone,
  onSignedIn,
}: {
  kind: "staff" | "guest";
  tone: "panel" | "guest";
  onSignedIn?: () => void;
}) {
  const accounts = demoAccounts(kind);
  const [email, setEmail] = useState(accounts[0]?.email ?? "");
  const [busy, setBusy] = useState(false);

  const enter = async () => {
    setBusy(true);
    try {
      await demoSignIn(email);
      onSignedIn?.();
    } catch (e) {
      toast.error(t((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const panel = tone === "panel";
  return (
    <div className="space-y-3">
      <label className="block">
        <span
          className={
            panel
              ? "mb-1.5 block text-sm font-medium"
              : "mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-400"
          }
        >
          {t("Entrar como")}
        </span>
        <select
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={
            panel
              ? "h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              : "w-full border border-neutral-200 bg-white px-3 py-2.5 text-sm"
          }
        >
          {accounts.map((a) => (
            <option key={a.email} value={a.email}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={busy || !email}
        onClick={enter}
        className={
          panel
            ? "flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
            : "flex w-full items-center justify-center gap-2 bg-[var(--brand)] py-3 font-semibold text-white disabled:opacity-50"
        }
      >
        <LogIn className="h-4 w-4" /> {busy ? t("Entrando…") : t("Entrar")}
      </button>
      <p className={panel ? "text-xs text-muted-foreground" : "text-xs text-neutral-400"}>
        {t(
          "Acceso de demostración con datos ficticios. En producción se entra con email y contraseña.",
        )}
      </p>
    </div>
  );
}
