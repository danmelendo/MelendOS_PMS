import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  CalendarClock,
  Download,
  Inbox,
  Loader2,
  LogOut,
  Mail,
  Phone,
  RefreshCw,
  Search,
  Trash2,
  Trophy,
  UserPlus,
  X,
} from "lucide-react";
import { Logo } from "../components/Layout";
import { BTN, FIELD, Stat } from "./admin-ui";
import { ClientsTab, draftFromLead } from "./AdminClients";
import { BillingTab } from "./AdminBilling";
import { LEAD_STATUSES, sales, type Lead, type LeadStatus } from "../lib/supabase";
import { PLANS, type PlanId } from "../../supabase/functions/_shared/plans.ts";
import { DEMO_TIMEZONE } from "../../supabase/functions/_shared/slots.ts";

// Sales admin panel: leads from the website, customers and what we bill them.
// Access is checked in the database (sales_admins + RLS); this page only shows
// what the server returns.

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleString("es-ES", { timeZone: DEMO_TIMEZONE, ...opts });
const dateTime = (iso: string) =>
  fmt(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const planName = (p: string | null) => (p ? (PLANS[p as PlanId]?.name ?? p) : "—");
const host = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};
const origin = (l: Lead) =>
  [l.utm_source, l.utm_medium, l.utm_campaign].filter(Boolean).join(" / ") ||
  (l.referrer ? host(l.referrer) : "Directo");

const STATUS_TONE: Record<LeadStatus, string> = {
  new: "bg-gold/20 text-gold-foreground",
  confirmed: "bg-secondary text-secondary-foreground",
  done: "bg-info/20 text-info-foreground",
  won: "bg-primary text-primary-foreground",
  lost: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
  no_show: "bg-destructive/10 text-destructive",
};

export function AdminPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const db = sales();
    db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = db.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return setIsAdmin(null);
    sales()
      .rpc("is_sales_admin")
      .then(({ data }) => setIsAdmin(data === true));
  }, [session]);

  if (session === undefined || (session && isAdmin === null))
    return (
      <Shell>
        <p className="flex items-center gap-2 p-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando…
        </p>
      </Shell>
    );
  if (!session) return <Login />;
  if (!isAdmin)
    return (
      <Shell email={session.user.email}>
        <div className="mx-auto max-w-md p-10 text-center">
          <p className="font-semibold">Esta cuenta no tiene acceso al panel.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pide que la añadan a la lista de administradores.
          </p>
        </div>
      </Shell>
    );
  return <Workspace email={session.user.email} />;
}

const TABS = { leads: "Leads", clientes: "Clientes", facturacion: "Facturación" } as const;
type Tab = keyof typeof TABS;
const tabFromHash = (): Tab => {
  const h = window.location.hash.slice(1);
  return h in TABS ? (h as Tab) : "leads";
};

function Workspace({ email }: { email?: string }) {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [pending, setPending] = useState<ReturnType<typeof draftFromLead> | null>(null);
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = (t: Tab) => {
    window.location.hash = t === "leads" ? "" : t;
    setTab(t);
  };
  const clearPending = useCallback(() => setPending(null), []);
  return (
    <Shell email={email}>
      <nav className="border-b bg-card" aria-label="Secciones">
        <div className="mx-auto flex max-w-7xl gap-1 px-4 sm:px-6">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => go(t)}
              aria-current={tab === t ? "page" : undefined}
              className={`border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {TABS[t]}
            </button>
          ))}
        </div>
      </nav>
      {tab === "leads" && (
        <Leads
          onConvert={(lead) => {
            setPending(draftFromLead(lead));
            go("clientes");
          }}
        />
      )}
      {tab === "clientes" && <ClientsTab pending={pending} onPendingUsed={clearPending} />}
      {tab === "facturacion" && <BillingTab />}
    </Shell>
  );
}

function Shell({ children, email }: { children: ReactNode; email?: string }) {
  const [changing, setChanging] = useState(false);
  return (
    <div className="min-h-[100svh] bg-background">
      <header className="border-b bg-navy text-navy-foreground">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Logo onNavy />
          <span className="text-sm text-navy-foreground/70">· Gestión</span>
          {email && (
            <div className="ml-auto flex items-center gap-2 text-sm">
              <span className="hidden text-navy-foreground/70 sm:inline">{email}</span>
              <button
                type="button"
                onClick={() => setChanging((c) => !c)}
                className="rounded-md px-2 py-1 text-navy-foreground/80 hover:bg-navy-accent"
              >
                Contraseña
              </button>
              <button
                type="button"
                onClick={() => sales().auth.signOut()}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-navy-foreground/80 hover:bg-navy-accent"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" /> Salir
              </button>
            </div>
          )}
        </div>
      </header>
      {changing && <ChangePassword onDone={() => setChanging(false)} />}
      {children}
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await sales().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError("Email o contraseña incorrectos.");
  };
  return (
    <Shell>
      <form onSubmit={submit} className="mx-auto mt-16 max-w-sm rounded-xl border bg-card p-6">
        <h1 className="text-lg font-semibold">Panel de gestión</h1>
        <p className="mt-1 text-sm text-muted-foreground">Solo para el equipo de ventas.</p>
        <label className="mt-5 block text-sm font-medium">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${FIELD} mt-1 block w-full`}
          />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Contraseña
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${FIELD} mt-1 block w-full`}
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className={`${BTN} mt-5 w-full bg-primary text-primary-foreground hover:bg-primary/90`}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Entrar
        </button>
      </form>
    </Shell>
  );
}

function ChangePassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 12) return setMsg("Usa al menos 12 caracteres.");
    if (pw !== pw2) return setMsg("Las dos contraseñas no coinciden.");
    const { error } = await sales().auth.updateUser({ password: pw });
    if (error) return setMsg(error.message);
    setMsg(null);
    onDone();
  };
  return (
    <form
      onSubmit={submit}
      className="mx-auto mt-4 flex max-w-7xl flex-wrap items-end gap-3 px-4 sm:px-6"
    >
      <label className="text-sm font-medium">
        Nueva contraseña
        <input
          type="password"
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className={`${FIELD} mt-1 block`}
        />
      </label>
      <label className="text-sm font-medium">
        Repítela
        <input
          type="password"
          autoComplete="new-password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          className={`${FIELD} mt-1 block`}
        />
      </label>
      <button type="submit" className={`${BTN} bg-primary text-primary-foreground`}>
        Guardar
      </button>
      {msg && <p className="text-sm text-destructive">{msg}</p>}
    </form>
  );
}

function Leads({ onConvert }: { onConvert: (lead: Lead) => void }) {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [kind, setKind] = useState<"" | "demo" | "contact">("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sales()
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) setError(error.message);
    else {
      setError(null);
      setLeads(data as Lead[]);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    // Links from the notification email open the lead (?lead=<id>).
    setOpenId(new URLSearchParams(window.location.search).get("lead"));
    return () => clearInterval(t);
  }, [load]);

  const now = Date.now();
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (leads ?? []).filter(
      (l) =>
        (!status || l.status === status) &&
        (!kind || l.kind === kind) &&
        (!needle ||
          [l.name, l.company, l.email, l.phone ?? ""].some((v) =>
            v.toLowerCase().includes(needle),
          )),
    );
  }, [leads, q, status, kind]);
  const upcoming = (leads ?? [])
    .filter(
      (l) =>
        l.slot_start &&
        new Date(l.slot_start).getTime() >= now - 30 * 60_000 &&
        (l.status === "new" || l.status === "confirmed"),
    )
    .sort((a, b) => a.slot_start!.localeCompare(b.slot_start!));
  const count = (s: LeadStatus) => (leads ?? []).filter((l) => l.status === s).length;
  const won = count("won");
  const closed = won + count("lost");
  const open = leads?.find((l) => l.id === openId) ?? null;

  const update = async (id: string, patch: Partial<Pick<Lead, "status" | "notes">>) => {
    const { error } = await sales().from("leads").update(patch).eq("id", id);
    if (error) return setError(error.message);
    setLeads((ls) => ls?.map((l) => (l.id === id ? { ...l, ...patch } : l)) ?? null);
  };
  const remove = async (id: string) => {
    const { error } = await sales().from("leads").delete().eq("id", id);
    if (error) return setError(error.message);
    setOpenId(null);
    setLeads((ls) => ls?.filter((l) => l.id !== id) ?? null);
  };

  return (
    <>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={Inbox} label="Nuevos por atender" value={count("new")} />
          <Stat icon={CalendarClock} label="Demos próximas" value={upcoming.length} />
          <Stat icon={Trophy} label="Ganados" value={won} />
          <Stat
            icon={Trophy}
            label="Conversión (ganados / cerrados)"
            value={closed ? `${Math.round((won / closed) * 100)} %` : "—"}
          />
        </div>

        {upcoming.length > 0 && (
          <section className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold">Próximas demos</h2>
            <ul className="mt-2 divide-y">
              {upcoming.slice(0, 6).map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(l.id)}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 py-2 text-left text-sm hover:bg-muted/60"
                  >
                    <span className="w-40 font-semibold tabular-nums first-letter:uppercase">
                      {fmt(l.slot_start!, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span>{l.company}</span>
                    <span className="text-muted-foreground">{l.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-xl border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <label className="relative">
              <span className="sr-only">Buscar</span>
              <Search
                className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nombre, hotel, email o teléfono"
                className={`${FIELD} w-64 pl-8`}
              />
            </label>
            <select
              aria-label="Estado"
              value={status}
              onChange={(e) => setStatus(e.target.value as LeadStatus | "")}
              className={FIELD}
            >
              <option value="">Todos los estados</option>
              {Object.entries(LEAD_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              aria-label="Tipo"
              value={kind}
              onChange={(e) => setKind(e.target.value as "" | "demo" | "contact")}
              className={FIELD}
            >
              <option value="">Demos y contactos</option>
              <option value="demo">Con cita</option>
              <option value="contact">Quieren que les llamemos</option>
            </select>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={load}
                className={`${BTN} border bg-background hover:bg-accent`}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Actualizar
              </button>
              <button
                type="button"
                onClick={() => downloadCsv(shown)}
                disabled={!shown.length}
                className={`${BTN} border bg-background hover:bg-accent`}
              >
                <Download className="h-4 w-4" aria-hidden="true" /> CSV
              </button>
            </div>
          </div>

          {error && <p className="p-4 text-sm text-destructive">{error}</p>}
          {leads === null ? (
            <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando leads…
            </p>
          ) : shown.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {leads.length ? "Ningún lead coincide con el filtro." : "Aún no hay leads."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-sm">
                <thead>
                  <tr className="border-b bg-muted text-left">
                    <th className="px-3 py-2 font-medium">Recibido</th>
                    <th className="px-3 py-2 font-medium">Cita</th>
                    <th className="px-3 py-2 font-medium">Hotel · contacto</th>
                    <th className="px-3 py-2 font-medium">Plan</th>
                    <th className="px-3 py-2 font-medium">Origen</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((l) => (
                    <tr
                      key={l.id}
                      onClick={() => setOpenId(l.id)}
                      className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                        {dateTime(l.created_at)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                        {l.slot_start ? (
                          dateTime(l.slot_start)
                        ) : (
                          <span className="text-muted-foreground">Llamar</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{l.company}</span>
                        <span className="block text-xs text-muted-foreground">
                          {l.name} · {l.email}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {planName(l.plan)}
                        {l.rooms ? (
                          <span className="text-muted-foreground"> · {l.rooms} hab.</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{origin(l)}</td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <select
                          aria-label={`Estado de ${l.company}`}
                          value={l.status}
                          onChange={(e) => update(l.id, { status: e.target.value as LeadStatus })}
                          className={`rounded-full border-0 px-2 py-1 text-xs font-semibold ${STATUS_TONE[l.status]}`}
                        >
                          {Object.entries(LEAD_STATUSES).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {open && (
        <LeadDrawer
          lead={open}
          onClose={() => setOpenId(null)}
          onSave={(patch) => update(open.id, patch)}
          onDelete={() => remove(open.id)}
          onConvert={() => onConvert(open)}
        />
      )}
    </>
  );
}

function LeadDrawer({
  lead,
  onClose,
  onSave,
  onDelete,
  onConvert,
}: {
  lead: Lead;
  onClose: () => void;
  onSave: (patch: Partial<Pick<Lead, "status" | "notes">>) => Promise<void>;
  onDelete: () => void;
  onConvert: () => void;
}) {
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const rows: [string, ReactNode][] = [
    ["Cita", lead.slot_start ? dateTime(lead.slot_start) : "Quiere que le llamemos"],
    ["Email", <a href={`mailto:${lead.email}`}>{lead.email}</a>],
    ["Teléfono", lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : "—"],
    ["Hoteles", lead.hotels],
    ["Habitaciones", lead.rooms ?? "—"],
    ["Plan", planName(lead.plan)],
    ["Qué quiere ver", lead.message ?? "—"],
    ["Novedades", lead.marketing_ok ? "Acepta recibirlas" : "No"],
    ["Origen", origin(lead)],
    ["Página", lead.page ?? "—"],
    ["Recibido", dateTime(lead.created_at)],
  ];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy/40" onClick={onClose}>
      <aside
        role="dialog"
        aria-label={`Lead de ${lead.company}`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-card shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b p-5">
          <div>
            <p className="text-lg font-semibold">{lead.company}</p>
            <p className="text-sm text-muted-foreground">{lead.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1 hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <dl className="divide-y px-5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 py-2">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-words whitespace-pre-line [&_a]:text-info-foreground [&_a]:underline">
                {v}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex gap-2 px-5 pt-2">
          <a
            href={`mailto:${lead.email}?subject=${encodeURIComponent("Tu demo de Melend/OS")}`}
            className={`${BTN} border bg-background hover:bg-accent`}
          >
            <Mail className="h-4 w-4" aria-hidden="true" /> Escribir
          </a>
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className={`${BTN} border bg-background hover:bg-accent`}>
              <Phone className="h-4 w-4" aria-hidden="true" /> Llamar
            </a>
          )}
          {lead.status === "won" && (
            <button
              type="button"
              onClick={onConvert}
              className={`${BTN} bg-primary text-primary-foreground hover:bg-primary/90`}
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" /> Convertir en cliente
            </button>
          )}
        </div>
        <label className="mt-5 block px-5 text-sm font-medium">
          Estado
          <select
            value={lead.status}
            onChange={(e) => onSave({ status: e.target.value as LeadStatus })}
            className={`${FIELD} mt-1 block w-full`}
          >
            {Object.entries(LEAD_STATUSES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-4 block px-5 text-sm font-medium">
          Notas internas
          <textarea
            rows={5}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setSaved(false);
            }}
            className={`${FIELD} mt-1 block h-auto w-full py-2`}
          />
        </label>
        <div className="flex items-center gap-3 px-5 pt-2">
          <button
            type="button"
            onClick={async () => {
              await onSave({ notes: notes.trim() || null });
              setSaved(true);
            }}
            className={`${BTN} bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            Guardar notas
          </button>
          {saved && <span className="text-sm text-muted-foreground">Guardadas</span>}
        </div>
        <div className="mt-auto border-t p-5">
          {confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>¿Borrar este lead para siempre?</span>
              <button
                type="button"
                onClick={onDelete}
                className={`${BTN} bg-destructive text-white`}
              >
                Sí, borrar
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className={`${BTN} border bg-background`}
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className={`${BTN} text-destructive hover:bg-destructive/10`}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Borrar (derecho de supresión)
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

function downloadCsv(leads: Lead[]) {
  const cols: [string, (l: Lead) => unknown][] = [
    ["recibido", (l) => l.created_at],
    ["tipo", (l) => l.kind],
    ["cita", (l) => l.slot_start ?? ""],
    ["estado", (l) => LEAD_STATUSES[l.status]],
    ["hotel", (l) => l.company],
    ["nombre", (l) => l.name],
    ["email", (l) => l.email],
    ["telefono", (l) => l.phone ?? ""],
    ["hoteles", (l) => l.hotels],
    ["habitaciones", (l) => l.rooms ?? ""],
    ["plan", (l) => planName(l.plan)],
    ["mensaje", (l) => l.message ?? ""],
    ["novedades", (l) => (l.marketing_ok ? "si" : "no")],
    ["origen", origin],
    ["notas", (l) => l.notes ?? ""],
  ];
  const cell = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [
    cols.map(([h]) => h).join(";"),
    ...leads.map((l) => cols.map(([, f]) => cell(f(l))).join(";")),
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
