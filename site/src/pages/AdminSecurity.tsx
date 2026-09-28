import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { sales } from "../lib/supabase";
import { BTN, BTN_OUTLINE, BTN_PRIMARY, FIELD } from "./admin-ui";
import { allowFor, inRange } from "../lib/ip";

// Seguridad: the IPs the management panel opens from (sales_allowed_ips). The
// page is guarded by the Vercel middleware and the data by the database, and
// each may see a different address (IPv4 to one, IPv6 to the other), so
// "Añadir mis IPs" adds both.

interface AllowedIp {
  id: string;
  network: string;
  label: string | null;
  created_at: string;
  includes_me: boolean;
}

async function webIp(): Promise<string | null> {
  try {
    const res = await fetch("/admin/__ip/", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { ip?: string };
    return body.ip || null;
  } catch {
    // Local development has no middleware.
    return null;
  }
}

export function SecurityTab() {
  const [list, setList] = useState<AllowedIp[] | null>(null);
  const [dbIp, setDbIp] = useState<string | null>(null);
  const [siteIp, setSiteIp] = useState<string | null>(null);
  const [network, setNetwork] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    const db = sales();
    const [l, a] = await Promise.all([db.rpc("list_admin_ips"), db.rpc("sales_access")]);
    if (l.error) return setError(l.error.message);
    setList(l.data as AllowedIp[]);
    setDbIp((a.data as { ip: string | null }[] | null)?.[0]?.ip ?? null);
  }, []);
  useEffect(() => {
    load();
    webIp().then(setSiteIp);
  }, [load]);

  const add = async (entries: { network: string; label: string }[]) => {
    setBusy(true);
    setError(null);
    for (const e of entries) {
      const { error } = await sales().rpc("add_admin_ip", {
        p_network: e.network,
        p_label: e.label,
      });
      if (error) {
        setError(error.message);
        break;
      }
    }
    setBusy(false);
    setNetwork("");
    setLabel("");
    load();
  };
  const remove = async (id: string) => {
    const { error } = await sales().rpc("remove_admin_ip", { p_id: id });
    setConfirm(null);
    if (error) return setError(error.message);
    load();
  };

  // The database says whether its view of us is inside the list; the web's
  // view is checked here.
  const dbMissing = !!dbIp && !(list ?? []).some((r) => r.includes_me);
  const siteMissing =
    !!siteIp && siteIp !== dbIp && !(list ?? []).some((r) => inRange(siteIp, r.network));
  // The database's view goes first: the first entry of the list must include it.
  const missing = [
    ...(dbMissing ? [{ network: allowFor(dbIp!), label: "Mi conexión (base de datos)" }] : []),
    ...(siteMissing ? [{ network: allowFor(siteIp!), label: "Mi conexión (web)" }] : []),
  ];

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      {list === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando…
        </p>
      ) : list.length === 0 ? (
        <div className="flex gap-3 rounded-xl border border-gold/50 bg-gold/10 p-4 text-sm">
          <ShieldAlert className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
          <div>
            <p className="font-semibold">Sin restricción por IP</p>
            <p className="mt-1">
              Ahora cualquiera con una cuenta del panel puede entrar desde cualquier red. Añade tu
              conexión para que solo se pueda entrar desde ella (y las que añadas después).
            </p>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 rounded-xl border bg-card p-4 text-sm">
          <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <p>
            El panel y sus datos solo se abren desde{" "}
            {list.length === 1 ? "esta dirección" : `estas ${list.length} direcciones`}. Desde
            cualquier otra red, la página responde «acceso no permitido» y la base de datos no
            devuelve nada, aunque se tenga la contraseña.
          </p>
        </div>
      )}

      <section className="rounded-xl border bg-card p-4 text-sm">
        <h2 className="font-semibold">Tu conexión ahora</h2>
        <dl className="mt-2 grid grid-cols-[10rem_1fr] gap-y-1">
          <dt className="text-muted-foreground">Vista por la base</dt>
          <dd className="font-mono">{dbIp ?? "—"}</dd>
          <dt className="text-muted-foreground">Vista por la web</dt>
          <dd className="font-mono">{siteIp ?? "— (solo en os.melendo.app)"}</dd>
        </dl>
        {missing.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => add(missing)}
            className={`${BTN_PRIMARY} mt-3`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            <Plus className="h-4 w-4" aria-hidden="true" /> Añadir mi
            {missing.length > 1 ? "s IPs" : " IP"} actual
            {missing.length > 1 ? "es" : ""}
          </button>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Si tu proveedor de internet cambia tu IP (pasa en muchas conexiones de casa), te quedarías
          fuera: añade también la del trabajo o del móvil, o usa un rango (p. ej. 83.45.120.0/24).
          Para recuperar el acceso sin panel: <code>site/scripts/admin-ips.mjs</code>.
        </p>
      </section>

      <section className="rounded-xl border bg-card">
        <h2 className="border-b p-4 text-sm font-semibold">Direcciones permitidas</h2>
        {list && list.length > 0 && (
          <ul className="divide-y">
            {list.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                <span className="font-mono">{r.network}</span>
                <span className="text-muted-foreground">{r.label ?? ""}</span>
                {r.includes_me && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                    estás aquí
                  </span>
                )}
                <span className="ml-auto">
                  {confirm === r.id ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="text-xs">
                        {list.length === 1
                          ? "¿Quitarla? El panel quedará abierto desde cualquier red."
                          : "¿Quitarla?"}
                      </span>
                      <button
                        type="button"
                        className={`${BTN} bg-destructive text-white`}
                        onClick={() => remove(r.id)}
                      >
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
                    <button
                      type="button"
                      aria-label={`Quitar ${r.network}`}
                      className="rounded-md p-1.5 hover:bg-muted"
                      onClick={() => setConfirm(r.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2 border-t p-4">
          <input
            className={`${FIELD} w-56 font-mono`}
            placeholder="83.45.120.7 o 83.45.120.0/24"
            aria-label="IP o rango"
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
          />
          <input
            className={`${FIELD} min-w-40 flex-1`}
            placeholder="Nombre (p. ej. oficina)"
            aria-label="Nombre"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button
            type="button"
            disabled={busy || !network.trim()}
            onClick={() => add([{ network: network.trim(), label }])}
            className={BTN_OUTLINE}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Añadir
          </button>
        </div>
        {error && <p className="px-4 pb-4 text-sm text-destructive">{error}</p>}
      </section>
    </main>
  );
}
