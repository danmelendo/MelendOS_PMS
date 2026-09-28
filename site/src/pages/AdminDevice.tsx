import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Factor } from "@supabase/supabase-js";
import { KeyRound, Laptop, Loader2, RefreshCw, ShieldAlert, Smartphone } from "lucide-react";
import { sales } from "../lib/supabase";
import { BTN_OUTLINE, BTN_PRIMARY, FIELD } from "./admin-ui";

// A device that is not trusted yet (this browser, pending approval). Two ways
// to approve it: the authenticator app's code (TOTP; the session becomes aal2
// and approve_sales_device_with_mfa accepts it), set up here the first time,
// or from another trusted device (Seguridad → Equipos).

/** The account's TOTP factors: the verified one, if any, and leftovers. */
export function useAuthenticator() {
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const { data, error } = await sales().auth.mfa.listFactors();
    if (error) return setError(error.message);
    setError(null);
    setFactors(data.all.filter((f) => f.factor_type === "totp"));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return {
    factors,
    verified: factors?.find((f) => f.status === "verified") ?? null,
    error,
    refresh,
  };
}

const cleanCode = (c: string) => c.replace(/\s/g, "");

/**
 * Sets up the authenticator app: QR and key, then the first code. On success
 * the session is aal2 (Supabase verifies it) and `onVerified` runs.
 */
export function TotpSetup({
  leftovers,
  onVerified,
  submitLabel,
}: {
  leftovers: Factor[];
  onVerified: () => Promise<void>;
  submitLabel: string;
}) {
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(
    null,
  );
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    const db = sales();
    // Leftovers of a set-up that was never finished.
    for (const f of leftovers) {
      if (f.status !== "verified") await db.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await db.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Melend/OS gestión ${new Date().toISOString().slice(0, 16)}`,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    if (!enrolling) return;
    setBusy(true);
    setError(null);
    const { error } = await sales().auth.mfa.challengeAndVerify({
      factorId: enrolling.id,
      code: cleanCode(code),
    });
    if (error) {
      setBusy(false);
      return setError("Código incorrecto. Prueba con el siguiente que muestre la app.");
    }
    try {
      await onVerified();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  if (!enrolling)
    return (
      <div>
        <button type="button" disabled={busy} onClick={start} className={BTN_PRIMARY}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          <Smartphone className="h-4 w-4" aria-hidden="true" /> Configurar la app de autenticación
        </button>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    );
  return (
    <form onSubmit={confirm} className="space-y-3">
      <p>1. Escanea este código con la app (Google Authenticator, Microsoft Authenticator, 1Password…):</p>
      <img
        src={enrolling.qr}
        alt="Código QR para la app de autenticación"
        className="h-44 w-44 rounded border bg-white p-2"
      />
      <p className="text-xs text-muted-foreground">
        ¿No puedes escanearlo? Escribe esta clave en la app:{" "}
        <span className="font-mono break-all">{enrolling.secret}</span>
      </p>
      <CodeField code={code} setCode={setCode} label="2. Escribe el código de 6 cifras que muestra" />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || cleanCode(code).length < 6} className={BTN_PRIMARY}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {submitLabel}
        </button>
        <button type="button" onClick={() => setEnrolling(null)} className={BTN_OUTLINE}>
          Cancelar
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}

function CodeField({
  code,
  setCode,
  label,
}: {
  code: string;
  setCode: (c: string) => void;
  label: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        required
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className={`${FIELD} mt-1 block w-40 font-mono tracking-widest`}
      />
    </label>
  );
}

export function DeviceGate({
  device,
  problem,
  onRecheck,
}: {
  /** This browser as the database knows it (null when it could not be checked). */
  device: { id: string; name: string; status: string } | null;
  /** Why it could not be checked (private mode, network…). */
  problem: string | null;
  /** Proves this device again; resolves to its status (null if it failed). */
  onRecheck: () => Promise<string | null>;
}) {
  const { factors, verified, error: factorsError } = useAuthenticator();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recheckError, setRecheckError] = useState<string | null>(null);

  const approve = useCallback(async () => {
    if (!device) return;
    const { error } = await sales().rpc("approve_sales_device_with_mfa", { p_device: device.id });
    if (error) throw new Error(error.message);
    if ((await onRecheck()) !== "trusted")
      throw new Error("Equipo aprobado, pero no se pudo confirmar: pulsa «Ya lo he aprobado».");
  }, [device, onRecheck]);

  const withCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!verified) return;
    setBusy(true);
    setError(null);
    const { error } = await sales().auth.mfa.challengeAndVerify({
      factorId: verified.id,
      code: cleanCode(code),
    });
    if (error) {
      setBusy(false);
      return setError("Código incorrecto. Prueba con el siguiente que muestre la app.");
    }
    try {
      await approve();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  const recheck = async () => {
    setBusy(true);
    setRecheckError(null);
    const status = await onRecheck();
    if (status === "pending") setRecheckError("Todavía no está aprobado.");
    setBusy(false);
  };

  if (!device)
    return (
      <div className="mx-auto mt-12 max-w-md rounded-xl border bg-card p-6 text-sm">
        <p className="flex items-center gap-2 font-semibold">
          <ShieldAlert className="h-5 w-5 text-destructive" aria-hidden="true" /> No se pudo
          comprobar este equipo
        </p>
        <p className="mt-2">{problem ?? "Error desconocido."}</p>
        <p className="mt-2 text-muted-foreground">
          El panel solo se abre desde equipos de confianza, que guardan una clave en el navegador.
          En una ventana privada o con los datos del sitio bloqueados no se puede guardar.
        </p>
        <button type="button" onClick={recheck} disabled={busy} className={`${BTN_OUTLINE} mt-4`}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}{" "}
          Reintentar
        </button>
        {recheckError && <p className="mt-2 text-destructive">{recheckError}</p>}
      </div>
    );

  return (
    <div className="mx-auto mt-12 max-w-lg space-y-4 px-4 text-sm">
      <div className="rounded-xl border bg-card p-6">
        <p className="flex items-center gap-2 text-base font-semibold">
          <Laptop className="h-5 w-5 text-primary" aria-hidden="true" /> Equipo sin aprobar
        </p>
        <p className="mt-2">
          El panel solo se abre desde equipos de confianza. Este equipo (
          <span className="font-semibold">{device.name}</span>) aún no lo es: apruébalo una vez y
          podrás entrar desde cualquier red.
        </p>

        <div className="mt-5 border-t pt-5">
          <p className="flex items-center gap-2 font-semibold">
            <KeyRound className="h-4 w-4" aria-hidden="true" /> Con la app de autenticación
          </p>
          {factors === null ? (
            factorsError ? (
              <p className="mt-2 text-destructive">{factorsError}</p>
            ) : (
              <p className="mt-2 flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando…
              </p>
            )
          ) : verified ? (
            <form onSubmit={withCode} className="mt-3 space-y-3">
              <CodeField code={code} setCode={setCode} label="Código de 6 cifras de la app" />
              <button
                type="submit"
                disabled={busy || cleanCode(code).length < 6}
                className={BTN_PRIMARY}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Aprobar
                este equipo
              </button>
              {error && <p className="text-destructive">{error}</p>}
            </form>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-muted-foreground">
                Tu cuenta aún no tiene la app configurada. Hazlo ahora: la necesitarás para aprobar
                equipos nuevos, y hasta que la configures, quien tuviera tu contraseña podría
                configurar la suya.
              </p>
              <TotpSetup
                leftovers={factors}
                onVerified={approve}
                submitLabel="Activar y aprobar este equipo"
              />
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <p className="font-semibold">Desde otro equipo de confianza</p>
        <p className="mt-1 text-muted-foreground">
          Abre el panel en un equipo ya aprobado, ve a <b>Seguridad → Equipos</b> y aprueba «
          {device.name}».
        </p>
        <button type="button" onClick={recheck} disabled={busy} className={`${BTN_OUTLINE} mt-3`}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}{" "}
          Ya lo he aprobado
        </button>
        {recheckError && <p className="mt-2 text-destructive">{recheckError}</p>}
      </div>
    </div>
  );
}
