import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  ExternalLink,
  KeyRound,
  Loader2,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import { sales, type Lead } from "../lib/supabase";
import {
  CLIENT_STATUSES,
  LINK_KINDS,
  day,
  daysUntil,
  eur,
  mrr,
  type Client,
  type ClientAccess,
  type ClientHotel,
  type ClientLink,
  type ClientStatus,
  type LinkKind,
} from "../lib/clients";
import {
  ADDON_IDS,
  PACKAGES,
  PLANS,
  PLAN_IDS,
  PLAN_PACKAGES,
  SLA_IDS,
  SLA_TIERS,
  quote,
  type AddonId,
  type PlanId,
  type SlaId,
} from "../../supabase/functions/_shared/plans.ts";
import { BTN, BTN_OUTLINE, BTN_PRIMARY, Drawer, FIELD, Field, Stat } from "./admin-ui";

// Clientes: who pays, what they contracted, their hotels, links and where each
// credential lives. Access is enforced in the database (sales admins only).

const STATUS_TONE: Record<ClientStatus, string> = {
  onboarding: "bg-gold/20 text-gold-foreground",
  active: "bg-primary text-primary-foreground",
  paused: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

type Draft = Partial<Client> & Pick<Client, "name" | "plan">;

const EMPTY: Draft = {
  name: "",
  plan: "starter",
  status: "onboarding",
  rooms: 10,
  packages: [],
  sla: null,
  billing_cycle: "monthly",
  founder: false,
  monthly_fee: 0,
  setup_fee: 0,
  vat_rate: 21,
};

export function draftFromLead(l: Lead): Draft {
  const plan = (PLAN_IDS as readonly string[]).includes(l.plan ?? "")
    ? (l.plan as PlanId)
    : "starter";
  return {
    ...EMPTY,
    lead_id: l.id,
    name: l.company,
    contact_name: l.name,
    billing_email: l.email,
    phone: l.phone,
    plan,
    rooms: l.rooms ?? 10,
  };
}

/** Suggested €/month for a contract, from the public price list (plans.ts). */
function suggested(d: Draft, hotels: number): number | null {
  try {
    const plan = d.plan as PlanId;
    const addons = (d.packages ?? []).filter(
      (p): p is AddonId =>
        (ADDON_IDS as string[]).includes(p) && !PLAN_PACKAGES[plan].includes(p as AddonId),
    );
    return quote({
      plan,
      rooms: Math.max(1, Number(d.rooms) || 1),
      hotels: Math.max(hotels, PLANS[plan].minHotels),
      addons,
      sla: PLANS[plan].slaAvailable ? ((d.sla as SlaId) ?? null) : null,
      annual: d.billing_cycle === "annual",
      founder: !!d.founder,
    }).effectiveMonthly;
  } catch {
    return null;
  }
}

export function ClientsTab({
  pending,
  onPendingUsed,
}: {
  /** A client to create (from a won lead), opened as soon as the tab shows. */
  pending: Draft | null;
  onPendingUsed: () => void;
}) {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [hotels, setHotels] = useState<ClientHotel[]>([]);
  const [access, setAccess] = useState<ClientAccess[]>([]);
  const [unpaid, setUnpaid] = useState<{ client_id: string; total: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ClientStatus | "">("");
  const [open, setOpen] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    const db = sales();
    const [c, h, a, i] = await Promise.all([
      db.from("clients").select("*").order("name"),
      db.from("client_hotels").select("*").order("name"),
      db.from("client_access").select("*").order("expires_on", { nullsFirst: false }),
      db.from("client_invoices").select("client_id, total").eq("status", "issued"),
    ]);
    const failed = [c, h, a, i].find((r) => r.error);
    if (failed?.error) return setError(failed.error.message);
    setError(null);
    setClients(c.data as Client[]);
    setHotels(h.data as ClientHotel[]);
    setAccess(a.data as ClientAccess[]);
    setUnpaid(i.data as { client_id: string; total: number }[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (pending) {
      setOpen(pending);
      onPendingUsed();
    }
  }, [pending, onPendingUsed]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (clients ?? []).filter(
      (c) =>
        (!status || c.status === status) &&
        (!needle ||
          [c.name, c.legal_name, c.tax_id, c.contact_name, c.billing_email]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(needle)) ||
          hotels.some((h) => h.client_id === c.id && h.name.toLowerCase().includes(needle))),
    );
  }, [clients, hotels, q, status]);

  const active = (clients ?? []).filter((c) => c.status === "active");
  const monthly = active.reduce((s, c) => s + mrr(c), 0);
  const expiring = access.filter((a) => a.expires_on && daysUntil(a.expires_on) <= 60);
  const pendingTotal = unpaid.reduce((s, i) => s + Number(i.total), 0);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={Users}
          label="Clientes activos"
          value={active.length}
          hint={`${(clients ?? []).filter((c) => c.status === "onboarding").length} en implantación`}
        />
        <Stat
          icon={TrendingUp}
          label="Ingresos recurrentes (MRR)"
          value={eur(monthly)}
          hint={`${eur(monthly * 12)} al año, sin IVA`}
        />
        <Stat
          icon={Building2}
          label="Pendiente de cobro"
          value={eur(pendingTotal)}
          hint="con IVA"
        />
        <Stat
          icon={KeyRound}
          label="Accesos que caducan en 60 días"
          value={expiring.length}
          hint={
            expiring.some((a) => daysUntil(a.expires_on!) < 0) ? "hay alguno caducado" : undefined
          }
        />
      </div>

      {expiring.length > 0 && (
        <section className="rounded-xl border border-gold/50 bg-gold/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-gold" aria-hidden="true" /> Accesos por renovar
          </p>
          <ul className="mt-2 space-y-1">
            {expiring.map((a) => {
              const c = clients?.find((x) => x.id === a.client_id);
              const left = daysUntil(a.expires_on!);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => c && setOpen(c)}
                  >
                    <span className="font-medium">{c?.name}</span> · {a.system} ·{" "}
                    {left < 0 ? `caducó hace ${-left} días` : `caduca en ${left} días`} (
                    {day(a.expires_on)})
                  </button>
                </li>
              );
            })}
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
              placeholder="Cliente, hotel, NIF o contacto"
              className={`${FIELD} w-64 pl-8`}
            />
          </label>
          <select
            aria-label="Estado"
            value={status}
            onChange={(e) => setStatus(e.target.value as ClientStatus | "")}
            className={FIELD}
          >
            <option value="">Todos los estados</option>
            {Object.entries(CLIENT_STATUSES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setOpen({ ...EMPTY })}
            className={`${BTN_PRIMARY} ml-auto`}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo cliente
          </button>
        </div>
        {error && <p className="p-4 text-sm text-destructive">{error}</p>}
        {clients === null ? (
          <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando clientes…
          </p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {clients.length
              ? "Ningún cliente coincide con el filtro."
              : "Aún no hay clientes. Créalos aquí o desde un lead ganado («Convertir en cliente»)."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b bg-muted text-left">
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Hoteles</th>
                  <th className="px-3 py-2 font-medium">Plan</th>
                  <th className="px-3 py-2 text-right font-medium">Cuota / mes</th>
                  <th className="px-3 py-2 font-medium">Próxima factura</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => {
                  const own = hotels.filter((h) => h.client_id === c.id);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setOpen(c)}
                      className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-3 py-2">
                        <span className="font-medium">{c.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[c.contact_name, c.billing_email].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {own.length ? own.map((h) => h.name).join(", ") : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {PLANS[c.plan]?.name ?? c.plan}
                        <span className="text-muted-foreground"> · {c.rooms} hab.</span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                        {eur(c.monthly_fee)}
                        {c.billing_cycle === "annual" && (
                          <span className="block text-xs text-muted-foreground">pago anual</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{day(c.next_invoice_date)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS_TONE[c.status]}`}
                        >
                          {CLIENT_STATUSES[c.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open && (
        <ClientDrawer
          initial={open}
          onClose={() => setOpen(null)}
          onChanged={load}
          onCreated={(c) => setOpen(c)}
        />
      )}
    </main>
  );
}

function ClientDrawer({
  initial,
  onClose,
  onChanged,
  onCreated,
}: {
  initial: Draft;
  onClose: () => void;
  onChanged: () => void;
  onCreated: (c: Client) => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Shown next to the delete button (the save message is far up the drawer).
  const [deleteMsg, setDeleteMsg] = useState<{
    text: string;
    ok?: boolean;
    canCancel?: boolean;
  } | null>(null);
  const [hotels, setHotels] = useState<ClientHotel[]>([]);
  const [links, setLinks] = useState<ClientLink[]>([]);
  const [access, setAccess] = useState<ClientAccess[]>([]);
  const id = d.id;

  useEffect(() => setD(initial), [initial]);

  const loadChildren = useCallback(async () => {
    if (!id) return;
    const db = sales();
    const [h, l, a] = await Promise.all([
      db.from("client_hotels").select("*").eq("client_id", id).order("created_at"),
      db.from("client_links").select("*").eq("client_id", id).order("created_at"),
      db.from("client_access").select("*").eq("client_id", id).order("created_at"),
    ]);
    setHotels((h.data ?? []) as ClientHotel[]);
    setLinks((l.data ?? []) as ClientLink[]);
    setAccess((a.data ?? []) as ClientAccess[]);
  }, [id]);
  useEffect(() => {
    loadChildren();
  }, [loadChildren]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    setMsg(null);
  };
  const plan = PLANS[d.plan as PlanId];
  const hint = suggested(d, Math.max(1, hotels.length));

  const save = async () => {
    if (!d.name.trim()) return setMsg("Pon un nombre.");
    setBusy(true);
    const row = {
      lead_id: d.lead_id ?? null,
      name: d.name.trim(),
      legal_name: d.legal_name || null,
      tax_id: d.tax_id || null,
      billing_email: d.billing_email || null,
      billing_address: d.billing_address || null,
      contact_name: d.contact_name || null,
      phone: d.phone || null,
      status: d.status ?? "onboarding",
      plan: d.plan,
      packages: d.packages ?? [],
      sla: plan?.slaAvailable ? (d.sla ?? null) : null,
      rooms: Math.max(1, Number(d.rooms) || 1),
      billing_cycle: d.billing_cycle ?? "monthly",
      founder: !!d.founder,
      monthly_fee: Number(d.monthly_fee) || 0,
      setup_fee: Number(d.setup_fee) || 0,
      vat_rate: Number(d.vat_rate ?? 21),
      start_date: d.start_date || null,
      next_invoice_date: d.next_invoice_date || null,
      notes: d.notes || null,
    };
    const db = sales();
    const res = id
      ? await db.from("clients").update(row).eq("id", id).select().single()
      : await db.from("clients").insert(row).select().single();
    setBusy(false);
    if (res.error) return setMsg(res.error.message);
    setMsg("Guardado");
    onChanged();
    if (!id) onCreated(res.data as Client);
    else setD(res.data as Client);
  };

  // Drafts go with the client; with issued invoices the database refuses
  // (they must be kept) and we offer to mark the client as «Baja» instead.
  const remove = async () => {
    if (!id) return;
    setDeleteMsg(null);
    const { error } = await sales().rpc("delete_client", { p_id: id });
    if (error) {
      return setDeleteMsg({
        text: error.message,
        canCancel: error.code === "23514" && d.status !== "cancelled",
      });
    }
    onChanged();
    onClose();
  };

  const markCancelled = async () => {
    if (!id) return;
    const { error } = await sales().from("clients").update({ status: "cancelled" }).eq("id", id);
    if (error) return setDeleteMsg({ text: error.message });
    setD((x) => ({ ...x, status: "cancelled" }));
    setConfirmDelete(false);
    setDeleteMsg({ text: "Dado de baja. Sus facturas se conservan.", ok: true });
    onChanged();
  };

  return (
    <Drawer
      wide
      title={id ? d.name : "Nuevo cliente"}
      subtitle={
        id ? `${plan?.name ?? d.plan} · ${CLIENT_STATUSES[d.status ?? "onboarding"]}` : undefined
      }
      onClose={onClose}
    >
      <div className="space-y-6 p-5">
        <Section title="Datos del cliente">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre comercial">
              <input
                className={`${FIELD} w-full`}
                value={d.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label="Estado">
              <select
                className={`${FIELD} w-full`}
                value={d.status ?? "onboarding"}
                onChange={(e) => set("status", e.target.value as ClientStatus)}
              >
                {Object.entries(CLIENT_STATUSES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Razón social">
              <input
                className={`${FIELD} w-full`}
                value={d.legal_name ?? ""}
                onChange={(e) => set("legal_name", e.target.value)}
              />
            </Field>
            <Field label="NIF / CIF">
              <input
                className={`${FIELD} w-full`}
                value={d.tax_id ?? ""}
                onChange={(e) => set("tax_id", e.target.value)}
              />
            </Field>
            <Field label="Contacto">
              <input
                className={`${FIELD} w-full`}
                value={d.contact_name ?? ""}
                onChange={(e) => set("contact_name", e.target.value)}
              />
            </Field>
            <Field label="Teléfono">
              <input
                className={`${FIELD} w-full`}
                value={d.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
            <Field label="Email de facturación">
              <input
                type="email"
                className={`${FIELD} w-full`}
                value={d.billing_email ?? ""}
                onChange={(e) => set("billing_email", e.target.value)}
              />
            </Field>
            <Field label="Dirección fiscal">
              <input
                className={`${FIELD} w-full`}
                value={d.billing_address ?? ""}
                onChange={(e) => set("billing_address", e.target.value)}
              />
            </Field>
          </div>
        </Section>

        <Section title="Contrato y facturación">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Plan">
              <select
                className={`${FIELD} w-full`}
                value={d.plan}
                onChange={(e) => set("plan", e.target.value as PlanId)}
              >
                {PLAN_IDS.map((p) => (
                  <option key={p} value={p}>
                    {PLANS[p].name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Habitaciones">
              <input
                type="number"
                min={1}
                className={`${FIELD} w-full`}
                value={d.rooms ?? 1}
                onChange={(e) => set("rooms", Number(e.target.value))}
              />
            </Field>
            <Field label="SLA">
              <select
                className={`${FIELD} w-full`}
                disabled={!plan?.slaAvailable}
                value={d.sla ?? ""}
                onChange={(e) => set("sla", (e.target.value || null) as Client["sla"])}
              >
                <option value="">Sin SLA</option>
                {SLA_IDS.map((s) => (
                  <option key={s} value={s}>
                    {SLA_TIERS[s].name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <fieldset className="mt-3">
            <legend className="text-sm font-medium">Paquetes sueltos</legend>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">
              {ADDON_IDS.map((p) => {
                const included = PLAN_PACKAGES[d.plan as PlanId]?.includes(p);
                return (
                  <label
                    key={p}
                    className={`flex items-center gap-1.5 ${included ? "text-muted-foreground" : ""}`}
                  >
                    <input
                      type="checkbox"
                      disabled={included}
                      checked={included || (d.packages ?? []).includes(p)}
                      onChange={(e) =>
                        set(
                          "packages",
                          e.target.checked
                            ? [...(d.packages ?? []), p]
                            : (d.packages ?? []).filter((x) => x !== p),
                        )
                      }
                    />
                    {PACKAGES[p].name}
                    {included && " (incluido)"}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Pago">
              <select
                className={`${FIELD} w-full`}
                value={d.billing_cycle ?? "monthly"}
                onChange={(e) => set("billing_cycle", e.target.value as Client["billing_cycle"])}
              >
                <option value="monthly">Mensual</option>
                <option value="annual">Anual por adelantado</option>
              </select>
            </Field>
            <Field label="Cuota pactada (€/mes, sin IVA)">
              <input
                type="number"
                min={0}
                step="0.01"
                className={`${FIELD} w-full`}
                value={d.monthly_fee ?? 0}
                onChange={(e) => set("monthly_fee", Number(e.target.value))}
              />
            </Field>
            <Field label="Implantación (€, sin IVA)">
              <input
                type="number"
                min={0}
                step="0.01"
                className={`${FIELD} w-full`}
                value={d.setup_fee ?? 0}
                onChange={(e) => set("setup_fee", Number(e.target.value))}
              />
            </Field>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={!!d.founder}
                onChange={(e) => set("founder", e.target.checked)}
              />
              Hotel fundador
            </label>
            {hint !== null && (
              <span className="text-muted-foreground">
                Tarifa pública: <strong className="text-foreground">{eur(hint)}/mes</strong>
                {Number(d.monthly_fee) !== hint && (
                  <button
                    type="button"
                    className="ml-2 text-info-foreground underline"
                    onClick={() => set("monthly_fee", hint)}
                  >
                    usar
                  </button>
                )}
              </span>
            )}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Alta">
              <input
                type="date"
                className={`${FIELD} w-full`}
                value={d.start_date ?? ""}
                onChange={(e) => set("start_date", e.target.value || null)}
              />
            </Field>
            <Field label="Próxima factura">
              <input
                type="date"
                className={`${FIELD} w-full`}
                value={d.next_invoice_date ?? ""}
                onChange={(e) => set("next_invoice_date", e.target.value || null)}
              />
            </Field>
            <Field label="IVA (%)">
              <input
                type="number"
                min={0}
                max={30}
                className={`${FIELD} w-full`}
                value={d.vat_rate ?? 21}
                onChange={(e) => set("vat_rate", Number(e.target.value))}
              />
            </Field>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Con el cliente «Activo» y una fecha de próxima factura, cada día se crea el borrador de
            la cuota que toque (y la implantación, una vez). Se emite desde Facturación.
          </p>
          <Field label="Notas internas" className="mt-3">
            <textarea
              rows={3}
              className={`${FIELD} h-auto w-full py-2`}
              value={d.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={save} disabled={busy} className={BTN_PRIMARY}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {id ? "Guardar cambios" : "Crear cliente"}
            </button>
            {msg && (
              <span
                className={`text-sm ${msg === "Guardado" ? "text-muted-foreground" : "text-destructive"}`}
              >
                {msg}
              </span>
            )}
          </div>
        </Section>

        {id && (
          <>
            <HotelsSection clientId={id} rows={hotels} onChanged={loadChildren} />
            <LinksSection clientId={id} rows={links} onChanged={loadChildren} />
            <AccessSection clientId={id} rows={access} onChanged={loadChildren} />
            <div className="border-t pt-4">
              {confirmDelete ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>¿Borrar el cliente con sus hoteles, enlaces y accesos?</span>
                  <button
                    type="button"
                    onClick={remove}
                    className={`${BTN} bg-destructive text-white`}
                  >
                    Sí, borrar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDelete(false);
                      setDeleteMsg(null);
                    }}
                    className={BTN_OUTLINE}
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
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Borrar cliente
                </button>
              )}
              {deleteMsg && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm" role="status">
                  <span className={deleteMsg.ok ? "text-muted-foreground" : "text-destructive"}>
                    {deleteMsg.text}
                  </span>
                  {deleteMsg.canCancel && (
                    <button type="button" onClick={markCancelled} className={BTN_OUTLINE}>
                      Dar de baja
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}

function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Adds a row to a child table and deletes rows, with a small inline form. */
function useChildTable(table: string, onChanged: () => void) {
  const [error, setError] = useState<string | null>(null);
  const add = async (row: Record<string, unknown>) => {
    const { error } = await sales().from(table).insert(row);
    if (error) return (setError(error.message), false);
    setError(null);
    onChanged();
    return true;
  };
  const remove = async (rowId: string) => {
    const { error } = await sales().from(table).delete().eq("id", rowId);
    if (error) return setError(error.message);
    onChanged();
  };
  return { error, add, remove };
}

const opt = (v: string) => v.trim() || null;

function HotelsSection({
  clientId,
  rows,
  onChanged,
}: {
  clientId: string;
  rows: ClientHotel[];
  onChanged: () => void;
}) {
  const t = useChildTable("client_hotels", onChanged);
  const [f, setF] = useState({
    name: "",
    environment: "production",
    project_ref: "",
    tenant_slug: "",
    panel_url: "",
    web_url: "",
    custom_domain: "",
  });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Section title="Hoteles">
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Sin hoteles todavía.</p>}
      <ul className="divide-y rounded-md border">
        {rows.map((h) => (
          <li key={h.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {h.name}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  · {h.environment === "production" ? "producción" : "demo"}
                  {h.tenant_slug && ` · ${h.tenant_slug}`}
                  {h.project_ref && ` · proyecto ${h.project_ref}`}
                </span>
              </p>
              <p className="flex flex-wrap gap-3 text-xs">
                {h.panel_url && <Out href={h.panel_url}>Panel</Out>}
                {h.web_url && <Out href={h.web_url}>Web</Out>}
                {h.project_ref && (
                  <Out href={`https://supabase.com/dashboard/project/${h.project_ref}`}>
                    Supabase
                  </Out>
                )}
                {h.custom_domain && (
                  <span className="text-muted-foreground">Dominio: {h.custom_domain}</span>
                )}
              </p>
            </div>
            <button
              type="button"
              aria-label={`Quitar ${h.name}`}
              onClick={() => t.remove(h.id)}
              className="rounded p-1 hover:bg-muted"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <input
          className={FIELD}
          placeholder="Nombre del hotel"
          value={f.name}
          onChange={up("name")}
        />
        <select
          className={FIELD}
          value={f.environment}
          onChange={up("environment")}
          aria-label="Entorno"
        >
          <option value="production">Producción</option>
          <option value="demo">Demo</option>
        </select>
        <input
          className={FIELD}
          placeholder="Slug del hotel en el PMS"
          value={f.tenant_slug}
          onChange={up("tenant_slug")}
        />
        <input
          className={FIELD}
          placeholder="Ref. del proyecto Supabase"
          value={f.project_ref}
          onChange={up("project_ref")}
        />
        <input
          className={FIELD}
          placeholder="URL del panel"
          value={f.panel_url}
          onChange={up("panel_url")}
        />
        <input
          className={FIELD}
          placeholder="URL de la web"
          value={f.web_url}
          onChange={up("web_url")}
        />
        <input
          className={FIELD}
          placeholder="Dominio propio"
          value={f.custom_domain}
          onChange={up("custom_domain")}
        />
        <button
          type="button"
          className={BTN_OUTLINE}
          disabled={!f.name.trim()}
          onClick={async () => {
            const ok = await t.add({
              client_id: clientId,
              name: f.name.trim(),
              environment: f.environment,
              project_ref: opt(f.project_ref),
              tenant_slug: opt(f.tenant_slug),
              panel_url: opt(f.panel_url),
              web_url: opt(f.web_url),
              custom_domain: opt(f.custom_domain),
            });
            if (ok)
              setF({
                name: "",
                environment: "production",
                project_ref: "",
                tenant_slug: "",
                panel_url: "",
                web_url: "",
                custom_domain: "",
              });
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Añadir hotel
        </button>
      </div>
      {t.error && <p className="mt-1 text-sm text-destructive">{t.error}</p>}
    </Section>
  );
}

function LinksSection({
  clientId,
  rows,
  onChanged,
}: {
  clientId: string;
  rows: ClientLink[];
  onChanged: () => void;
}) {
  const t = useChildTable("client_links", onChanged);
  const [f, setF] = useState({ kind: "panel" as LinkKind, label: "", url: "" });
  return (
    <Section title="Enlaces">
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Panel, web, Supabase, hosting, VPS…</p>
      )}
      <ul className="flex flex-wrap gap-2">
        {rows.map((l) => (
          <li key={l.id} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
            <Out href={l.url}>
              <span className="text-xs text-muted-foreground">{LINK_KINDS[l.kind]} · </span>
              {l.label}
            </Out>
            <button
              type="button"
              aria-label={`Quitar ${l.label}`}
              onClick={() => t.remove(l.id)}
              className="rounded p-0.5 hover:bg-muted"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 grid gap-2 sm:grid-cols-[10rem_1fr_1fr_auto]">
        <select
          className={FIELD}
          aria-label="Tipo"
          value={f.kind}
          onChange={(e) => setF({ ...f, kind: e.target.value as LinkKind })}
        >
          {Object.entries(LINK_KINDS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          className={FIELD}
          placeholder="Nombre"
          value={f.label}
          onChange={(e) => setF({ ...f, label: e.target.value })}
        />
        <input
          className={FIELD}
          placeholder="https://…"
          value={f.url}
          onChange={(e) => setF({ ...f, url: e.target.value })}
        />
        <button
          type="button"
          className={BTN_OUTLINE}
          disabled={!f.label.trim() || !/^https?:\/\//i.test(f.url.trim())}
          onClick={async () => {
            if (
              await t.add({
                client_id: clientId,
                kind: f.kind,
                label: f.label.trim(),
                url: f.url.trim(),
              })
            )
              setF({ ...f, label: "", url: "" });
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Añadir
        </button>
      </div>
      {t.error && <p className="mt-1 text-sm text-destructive">{t.error}</p>}
    </Section>
  );
}

function AccessSection({
  clientId,
  rows,
  onChanged,
}: {
  clientId: string;
  rows: ClientAccess[];
  onChanged: () => void;
}) {
  const t = useChildTable("client_access", onChanged);
  const [f, setF] = useState({ system: "", location: "", holder: "", expires_on: "" });
  return (
    <Section title="Accesos y credenciales">
      <p className="mb-2 rounded-md bg-info/10 p-2 text-xs text-info-foreground">
        Aquí se apunta <strong>dónde</strong> está cada credencial y cuándo caduca, nunca la
        contraseña ni la clave: esas van en Vault, en el banco o en el gestor de contraseñas.
      </p>
      {rows.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 font-medium">Qué</th>
              <th className="py-1 font-medium">Dónde está</th>
              <th className="py-1 font-medium">Titular</th>
              <th className="py-1 font-medium">Caduca</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const left = a.expires_on ? daysUntil(a.expires_on) : null;
              return (
                <tr key={a.id} className="border-t align-top">
                  <td className="py-1.5 pr-2 font-medium">{a.system}</td>
                  <td className="py-1.5 pr-2 break-words">{a.location}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{a.holder ?? "—"}</td>
                  <td
                    className={`py-1.5 pr-2 whitespace-nowrap ${left !== null && left <= 60 ? "font-semibold text-destructive" : ""}`}
                  >
                    {day(a.expires_on)}
                  </td>
                  <td className="py-1.5 text-right">
                    <button
                      type="button"
                      aria-label={`Quitar ${a.system}`}
                      onClick={() => t.remove(a.id)}
                      className="rounded p-1 hover:bg-muted"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input
          className={FIELD}
          placeholder="Qué (p. ej. TPV Redsys, certificado VERI*FACTU)"
          value={f.system}
          onChange={(e) => setF({ ...f, system: e.target.value })}
        />
        <input
          className={FIELD}
          placeholder="Dónde está (p. ej. Vault prod › payments/lumen)"
          value={f.location}
          onChange={(e) => setF({ ...f, location: e.target.value })}
        />
        <input
          className={FIELD}
          placeholder="Titular (opcional)"
          value={f.holder}
          onChange={(e) => setF({ ...f, holder: e.target.value })}
        />
        <div className="flex gap-2">
          <input
            type="date"
            aria-label="Caduca"
            className={`${FIELD} flex-1`}
            value={f.expires_on}
            onChange={(e) => setF({ ...f, expires_on: e.target.value })}
          />
          <button
            type="button"
            className={BTN_OUTLINE}
            disabled={!f.system.trim() || !f.location.trim()}
            onClick={async () => {
              const ok = await t.add({
                client_id: clientId,
                system: f.system.trim(),
                location: f.location.trim(),
                holder: opt(f.holder),
                expires_on: f.expires_on || null,
              });
              if (ok) setF({ system: "", location: "", holder: "", expires_on: "" });
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Añadir
          </button>
        </div>
      </div>
      {t.error && <p className="mt-1 text-sm text-destructive">{t.error}</p>}
    </Section>
  );
}

function Out({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 text-info-foreground hover:underline"
    >
      {children}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}
