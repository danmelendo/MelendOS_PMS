import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SesTraveller } from "@domain/ses.ts";

// Traveller register (SES.HOSPEDAJES) for the panel: the queue of
// communications to the Ministry of the Interior, the guests of each stay and
// the hotel's set-up (docs/ses-hospedajes.md).

export type SesStatus =
  | "pending"
  | "blocked"
  | "sent"
  | "accepted"
  | "rejected"
  | "error"
  | "skipped"
  | "cancelled";

export const SES_STATUS: Record<
  SesStatus,
  { label: string; tone: "muted" | "info" | "ok" | "warn" | "bad" }
> = {
  pending: { label: "Por enviar", tone: "info" },
  blocked: { label: "Faltan datos", tone: "warn" },
  sent: { label: "Enviada", tone: "info" },
  accepted: { label: "Registrada", tone: "ok" },
  rejected: { label: "Rechazada", tone: "bad" },
  error: { label: "Error de envío", tone: "bad" },
  skipped: { label: "No necesaria", tone: "muted" },
  cancelled: { label: "Anulada", tone: "muted" },
};

/** Still needs someone (or the next run) before it is done. */
export const OPEN: SesStatus[] = ["pending", "blocked", "sent", "rejected", "error"];

export interface SesCommunication {
  id: string;
  tenant_id: string;
  reservation_id: string;
  kind: "PV" | "RH";
  operation: "A" | "B";
  status: SesStatus;
  due_at: string;
  ses_code: string | null;
  error: string | null;
  attempts: number;
  sent_at: string | null;
  resolved_at: string | null;
  created_at: string;
  reservation: {
    reference: string;
    start_at: string;
    end_at: string;
    people: number;
    status: string;
    customer: { name: string | null } | null;
    room: { name: string } | null;
  } | null;
}

export function useSesQueue(tenantId: string | null, scope: "open" | "all") {
  return useQuery({
    queryKey: ["ses", "queue", tenantId, scope],
    enabled: !!tenantId,
    refetchInterval: 20_000,
    queryFn: async () => {
      let q = supabase
        .from("ses_communications")
        .select(
          "id, tenant_id, reservation_id, kind, operation, status, due_at, ses_code, error, attempts, sent_at, resolved_at, created_at, reservation:reservations(reference, start_at, end_at, people, status, customer:customers(name), room:rooms(name))",
        )
        .eq("tenant_id", tenantId!)
        .order("due_at", { ascending: true })
        .limit(300);
      if (scope === "open") q = q.in("status", OPEN);
      else q = q.gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SesCommunication[];
    },
  });
}

/** Overdue or refused communications of the staff member's hotels (menu badge). */
export function useSesAttention() {
  return useQuery({
    queryKey: ["ses", "attention"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("ses_communications")
        .select("id", { count: "exact", head: true })
        .or(
          `status.in.(blocked,rejected,error),and(status.in.(pending,sent),due_at.lt.${new Date().toISOString()})`,
        );
      return count ?? 0;
    },
  });
}

export interface SesSettings {
  tenant_id: string;
  enabled: boolean;
  environment: "simulated" | "pre" | "prod";
  landlord_code: string | null;
  app_name: string;
  has_credentials: boolean;
}

export function useSesSettings(tenantId: string | null) {
  return useQuery({
    queryKey: ["ses", "settings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const [{ data: s }, { data: est }, { data: props }] = await Promise.all([
        supabase.from("ses_settings").select("*").eq("tenant_id", tenantId!).maybeSingle(),
        supabase.from("ses_establishments").select("property_id, code").eq("tenant_id", tenantId!),
        supabase
          .from("properties")
          .select("id, name")
          .eq("tenant_id", tenantId!)
          .eq("active", true)
          .order("sort_order"),
      ]);
      return {
        settings: (s as SesSettings | null) ?? null,
        establishments: Object.fromEntries(
          (est ?? []).map((e) => [e.property_id, e.code]),
        ) as Record<string, string>,
        properties: props ?? [],
      };
    },
  });
}

export function useSesActions(tenantId: string | null) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["ses"] });
  return {
    dispatch: useMutation({
      mutationFn: async () => {
        const { data, error } = await supabase.functions.invoke("ses-dispatch", {
          body: { tenant_id: tenantId },
        });
        if (error) {
          const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
          throw new Error(body?.error ?? error.message);
        }
        const r = data.results?.[tenantId!];
        if (r?.error) throw new Error(r.error);
        return r as {
          sent: number;
          accepted: number;
          rejected: number;
          blocked: number;
          errors: number;
        };
      },
      onSettled: refresh,
    }),
    retry: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.rpc("ses_retry", { p_id: id });
        if (error) throw new Error(error.message);
      },
      onSettled: refresh,
    }),
    saveSettings: useMutation({
      mutationFn: async (data: Record<string, unknown>) => {
        const { error } = await supabase.rpc("save_ses_settings", {
          p_tenant: tenantId!,
          p_data: data as never,
        });
        if (error) throw new Error(error.message);
      },
      onSettled: refresh,
    }),
    saveCredentials: useMutation({
      mutationFn: async (c: { user: string; password: string; caCert?: string }) => {
        const { error } = await supabase.rpc("save_ses_credentials", {
          p_tenant: tenantId!,
          p_user: c.user,
          p_password: c.password,
          p_ca_cert: c.caCert || undefined,
        });
        if (error) throw new Error(error.message);
      },
      onSettled: refresh,
    }),
  };
}

// ── Guests of a stay ────────────────────────────────────────────────────────

export interface TravellerRow {
  id: string;
  is_holder: boolean;
  first_name: string;
  last_name1: string | null;
  last_name2: string | null;
  document_type: string | null;
  document_hint: string | null;
  nationality: string | null;
  is_minor: boolean;
  kinship: string | null;
  missing: string[];
}

export function useStayTravellers(reservationId: string | null) {
  return useQuery({
    queryKey: ["ses", "travellers", reservationId],
    enabled: !!reservationId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_stay_travellers", {
        p_reservation: reservationId!,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as TravellerRow[];
    },
  });
}

export function useTravellerActions(reservationId: string | null) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["ses"] });
  return {
    save: useMutation({
      mutationFn: async ({ id, data }: { id?: string; data: SesTraveller }) => {
        const { error } = await supabase.rpc("save_stay_traveller", {
          p_reservation: reservationId!,
          p_data: data as never,
          p_id: id,
        });
        if (error) throw new Error(error.message);
      },
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.rpc("delete_stay_traveller", { p_id: id });
        if (error) throw new Error(error.message);
      },
      onSettled: refresh,
    }),
  };
}

/** Labels of the fields the register may ask for. */
export const FIELD_LABELS: Record<string, string> = {
  first_name: "nombre",
  last_name1: "primer apellido",
  last_name2: "segundo apellido",
  document_type: "tipo de documento",
  document_number: "número de documento",
  document_support: "número de soporte",
  birth_date: "fecha de nacimiento",
  nationality: "nacionalidad",
  sex: "sexo",
  address: "dirección",
  postal_code: "código postal",
  country: "país de residencia",
  municipality_code: "municipio (INE)",
  municipality_name: "ciudad",
  phone: "teléfono o email",
  email: "email",
  kinship: "parentesco",
};

// ── Online check-in (the guest, with the booking link or their account) ─────

export function useGuestTravellers(reservationId: string, token: string | null) {
  return useQuery({
    queryKey: ["ses", "guest-travellers", reservationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("guest_list_travellers", {
        p_reservation: reservationId,
        p_token: token as string,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as TravellerRow[];
    },
  });
}

export function useGuestTravellerSave(reservationId: string, token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: SesTraveller }) => {
      const { error } = await supabase.rpc("guest_save_traveller", {
        p_reservation: reservationId,
        p_token: token as string,
        p_data: data as never,
        p_id: id,
      });
      if (error) throw new Error(error.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["ses", "guest-travellers", reservationId] }),
  });
}
