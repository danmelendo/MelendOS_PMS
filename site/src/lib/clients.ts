// Customers of Melend/OS and what we bill them (tables in the sales project,
// migration 20260929120000_clients.sql). Only sales admins can read them.

export const CLIENT_STATUSES = {
  onboarding: "En implantación",
  active: "Activo",
  paused: "En pausa",
  cancelled: "Baja",
} as const;
export type ClientStatus = keyof typeof CLIENT_STATUSES;

export const INVOICE_STATUSES = {
  draft: "Borrador",
  issued: "Emitida",
  paid: "Cobrada",
  cancelled: "Anulada",
} as const;
export type InvoiceStatus = keyof typeof INVOICE_STATUSES;

export const LINK_KINDS = {
  panel: "Panel del PMS",
  web: "Web del hotel",
  supabase: "Supabase",
  hosting: "Hosting",
  vps: "VPS / servidor",
  repo: "Repositorio",
  docs: "Documentación",
  other: "Otro",
} as const;
export type LinkKind = keyof typeof LINK_KINDS;

export interface Client {
  id: string;
  lead_id: string | null;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  billing_email: string | null;
  billing_address: string | null;
  contact_name: string | null;
  phone: string | null;
  status: ClientStatus;
  plan: "hostal" | "starter" | "pro" | "group";
  packages: string[];
  sla: "priority" | "urgent" | "always" | null;
  rooms: number;
  billing_cycle: "monthly" | "annual";
  founder: boolean;
  monthly_fee: number;
  setup_fee: number;
  vat_rate: number;
  start_date: string | null;
  next_invoice_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientHotel {
  id: string;
  client_id: string;
  name: string;
  environment: "production" | "demo";
  project_ref: string | null;
  tenant_slug: string | null;
  panel_url: string | null;
  web_url: string | null;
  custom_domain: string | null;
  notes: string | null;
}

export interface ClientLink {
  id: string;
  client_id: string;
  kind: LinkKind;
  label: string;
  url: string;
}

export interface ClientAccess {
  id: string;
  client_id: string;
  system: string;
  location: string;
  holder: string | null;
  expires_on: string | null;
  notes: string | null;
}

export interface ClientInvoice {
  id: string;
  client_id: string;
  kind: "subscription" | "setup" | "other";
  concept: string;
  period_start: string | null;
  period_end: string | null;
  base: number;
  vat_rate: number;
  total: number;
  status: InvoiceStatus;
  number: string | null;
  issued_on: string | null;
  due_on: string | null;
  paid_on: string | null;
  method: string | null;
  notes: string | null;
  created_at: string;
  /** VERI*FACTU environment it was issued in (null: without VERI*FACTU). */
  verifactu_env?: "simulated" | "pre" | "prod" | null;
}

export const eur = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n) || 0);

/** A plain date (yyyy-mm-dd) as "28 sept 2026", without time-zone shifts. */
export const day = (d: string | null) =>
  d
    ? new Date(`${d}T12:00:00`).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

export const today = () => new Date().toISOString().slice(0, 10);

/** Monthly recurring revenue of a client: annual contracts count as their monthly share. */
export const mrr = (c: Pick<Client, "status" | "monthly_fee">) =>
  c.status === "active" ? Number(c.monthly_fee) : 0;

/** Days until a date (negative when past). */
export const daysUntil = (d: string) =>
  Math.round((new Date(`${d}T12:00:00`).getTime() - Date.now()) / 86_400_000);
