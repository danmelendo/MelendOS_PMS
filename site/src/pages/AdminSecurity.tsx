import { useCallback, useEffect, useState } from "react";
import { Laptop, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { sales } from "../lib/supabase";
import { BTN, BTN_OUTLINE, BTN_PRIMARY } from "./admin-ui";
import { TotpSetup, useAuthenticator } from "./AdminDevice";
import { DEMO_TIMEZONE } from "../../supabase/functions/_shared/slots.ts";

// Seguridad: the trusted devices the panel opens from (sales_devices, migration
// 20260929160000_trusted_devices.sql) and the authenticator app that approves
// new ones. Approving and revoking go through the database, which only lets a
// trusted session do either.

interface Device {
  id: string;
  owner: string;
  name: string;
  created_at: string;
  approved_at: string | null;
  approved_via: "mfa" | "device" | "script" | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  is_current: boolean;
}

const VIA: Record<NonNullable<Device["approved_via"]>, string> = {
  mfa: "con la app",
  device: "desde otro equipo",
  script: "por script",
};

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-ES", {
        timeZone: DEMO_TIMEZONE,
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export function SecurityTab({ onDeviceChange }: { onDeviceChange: () => Promise<unknown> }) {
  const [list, setList] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; action: "approve" | "revoke" } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const app = useAuthenticator();

  const load = useCallback(async () => {
    const { data, error } = await sales().rpc("list_sales_devices");
    if (error) return setError(error.message);
    setList(data as Device[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (d: Device, action: "approve" | "revoke") => {
    setBusy(true);
    setError(null);
    const { error } = await sales().rpc(
      action === "approve" ? "approve_sales_device" : "revoke_sales_device",
      { p_device: d.id },
    );
    setBusy(false);
    setConfirm(null);
    if (error) return setError(error.message);
    // Revoking this very device closes the panel here at once.
    if (action === "revoke" && d.is_current) return void onDeviceChange();
    load();
  };

  const pending = (list ?? []).filter((d) => !d.approved_at && !d.revoked_at).length;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex gap-3 rounded-xl border bg-card p-4 text-sm">
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <p>
          El panel y sus datos solo se abren desde <b>equipos de confianza</b>, desde cualquier red.
          Cada navegador guarda una clave que no se puede copiar y firma cada sesión con ella; con
          la contraseña sola, la base de datos no devuelve nada. Un equipo nuevo se aprueba con el
          código de la app de autenticación o desde aquí.
        </p>
      </div>

      <section className="rounded-xl border bg-card p-4 text-sm">
        <h2 className="font-semibold">App de autenticación</h2>
        {app.factors === null ? (
          <p className="mt-2 flex items-center gap-2 text-muted-foreground">
            {app.error ?? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando…
              </>
            )}
          </p>
        ) : app.verified ? (
          <p className="mt-2">
            Configurada el {when(app.verified.created_at)}. Con su código apruebas un equipo nuevo
            desde ese mismo equipo. Si pierdes el móvil: <code>scripts/admin-devices.mjs</code>{" "}
            (<code>reset-mfa</code>).
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            <p className="flex gap-2 rounded-md border border-gold/50 bg-gold/10 p-3">
              <ShieldAlert className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
              Sin configurar. Hazlo ya: hasta entonces, quien tuviera tu contraseña podría
              configurar la suya y aprobar su equipo.
            </p>
            <TotpSetup leftovers={app.factors} onVerified={app.refresh} submitLabel="Activar" />
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card">
        <h2 className="flex items-center gap-2 border-b p-4 text-sm font-semibold">
          Equipos
          {pending > 0 && (
            <span className="rounded-full bg-gold/20 px-2 py-0.5 text-xs text-gold-foreground">
              {pending} pendiente{pending > 1 ? "s" : ""}
            </span>
          )}
        </h2>
        {list === null ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando…
          </p>
        ) : (
          <ul className="divide-y">
            {list.map((d) => (
              <li
                key={d.id}
                className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm ${d.revoked_at ? "text-muted-foreground" : ""}`}
              >
                <Laptop className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {d.name}
                    {d.is_current && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                        este equipo
                      </span>
                    )}
                    <Status d={d} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {d.owner} · alta {when(d.created_at)} · último uso {when(d.last_seen_at)}
                    {d.approved_at &&
                      ` · aprobado ${when(d.approved_at)}${d.approved_via ? ` ${VIA[d.approved_via]}` : ""}`}
                    {d.revoked_at && ` · revocado ${when(d.revoked_at)}`}
                  </p>
                </div>
                {!d.revoked_at && (
                  <span className="ml-auto">
                    {confirm?.id === d.id ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span className="text-xs">
                          {confirm.action === "approve"
                            ? "¿Aprobarlo? Podrá abrir el panel."
                            : d.is_current
                              ? "¿Revocar este equipo? Se cerrará el panel aquí."
                              : "¿Revocarlo? Sus sesiones se cortan ya."}
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          className={
                            confirm.action === "approve"
                              ? BTN_PRIMARY
                              : `${BTN} bg-destructive text-white`
                          }
                          onClick={() => act(d, confirm.action)}
                        >
                          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                          Sí
                        </button>
                        <button
                          type="button"
                          className={BTN_OUTLINE}
                          onClick={() => setConfirm(null)}
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex gap-2">
                        {!d.approved_at && (
                          <button
                            type="button"
                            className={BTN_OUTLINE}
                            onClick={() => setConfirm({ id: d.id, action: "approve" })}
                          >
                            Aprobar
                          </button>
                        )}
                        <button
                          type="button"
                          className={`${BTN_OUTLINE} text-destructive`}
                          onClick={() => setConfirm({ id: d.id, action: "revoke" })}
                        >
                          Revocar
                        </button>
                      </span>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="px-4 pb-4 text-sm text-destructive">{error}</p>}
        <p className="border-t p-4 text-xs text-muted-foreground">
          ¿Un equipo perdido o que no reconoces? Revócalo: sus sesiones dejan de ver datos al
          momento. Un pendiente que no reconoces es alguien con tu contraseña: revócalo y cámbiala.
          Sin acceso a ningún equipo: <code>node --env-file=.env scripts/admin-devices.mjs</code>{" "}
          desde <code>site/</code>.
        </p>
      </section>
    </main>
  );
}

function Status({ d }: { d: Device }) {
  const [text, tone] = d.revoked_at
    ? ["revocado", "bg-muted text-muted-foreground"]
    : d.approved_at
      ? ["de confianza", "bg-primary text-primary-foreground"]
      : ["pendiente", "bg-gold/20 text-gold-foreground"];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{text}</span>;
}
