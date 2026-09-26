import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_ACCESS, demoSignIn } from "@/lib/demo-access";

// Customer files for the panel. Contact details and stays come from
// customer_directory(); the sensitive identity data (traveller register) only
// through save_guest_identity (reception and admins) and get_guest_identity
// (admins, right after signing in again; every read is logged).

export interface CustomerRow {
  id: string;
  tenant_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  no_contact: boolean;
  notes: string | null;
  created_at: string;
  stays: number;
  nights: number;
  spent: number;
  last_check_out: string | null;
  next_check_in: string | null;
  in_house: boolean;
  has_identity: boolean;
  /** Matches before paging. */
  total: number;
}

export interface DirectoryFilters {
  tenant: string | null;
  search: string;
  stay: "all" | "in_house" | "upcoming" | "guests" | "never";
  identity: "all" | "registered" | "missing";
  sort: "recent" | "name" | "stays" | "spent" | "next";
  limit: number;
}

export interface GuestIdentity {
  document_type: "dni" | "nie" | "passport" | "other";
  document_number: string;
  document_country: string | null;
  nationality: string | null;
  birth_date: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  updated_at?: string;
}

export const DOCUMENT_TYPES: Record<GuestIdentity["document_type"], string> = {
  dni: "DNI",
  nie: "NIE",
  passport: "Pasaporte",
  other: "Otro documento",
};

/** Filtered, sorted and paged in the database. */
export function useCustomerDirectory(f: DirectoryFilters) {
  return useQuery({
    queryKey: ["customers", "directory", f],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("customer_directory", {
        p_tenant: f.tenant ?? undefined,
        p_search: f.search.trim() || undefined,
        p_stay: f.stay,
        p_identity: f.identity,
        p_sort: f.sort,
        p_limit: f.limit,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CustomerRow[];
    },
  });
}

export function useSaveIdentity(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (identity: GuestIdentity) => {
      const { error } = await supabase.rpc("save_guest_identity", {
        p_customer_id: customerId,
        p_data: identity as never,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.removeQueries({ queryKey: ["guest-identity", customerId] });
    },
  });
}

/** The identity of a customer (admins, right after signing in again). */
export async function fetchIdentity(customerId: string): Promise<GuestIdentity | null> {
  const { data, error } = await supabase.rpc("get_guest_identity", { p_customer_id: customerId });
  if (error) throw new Error(error.message);
  return (data as unknown as GuestIdentity | null) ?? null;
}

/**
 * Signs the staff member in again, so the server sees a fresh sign-in. In the
 * demo there are no passwords: the demo account signs in again.
 */
export async function confirmIdentity(email: string, password: string): Promise<void> {
  if (DEMO_ACCESS) return demoSignIn(email);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error("Contraseña incorrecta");
}
