import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

// The stay's bill (folio): booking total, charges during the stay, payments
// and the balance. Guests use get_folio / order_service / stays-extend;
// reception works on folio_charges and stay_extensions under RLS.

export const SERVICE_CATEGORIES: Record<string, string> = {
  food: "Comida y bebida",
  catering: "Catering",
  laundry: "Lavandería",
  parking: "Parking",
  minibar: "Minibar",
  spa: "Spa",
  other: "Otros",
};

export interface FolioCharge {
  id: string;
  category: string;
  description: string;
  qty: number;
  unit_price: number;
  amount: number;
  status: "requested" | "posted" | "void";
  source?: "guest" | "staff";
  note?: string | null;
  created_at: string;
  void_reason?: string | null;
}

export interface Folio {
  reservation_id: string;
  status: string;
  booking_total: number;
  paid: number;
  balance: number;
  charges: FolioCharge[];
  extension: {
    id: string;
    new_check_out: string;
    nights: number;
    amount: number;
    status: "pending" | "approved" | "rejected";
  } | null;
}

export interface StayService {
  id: string;
  tenant_id: string;
  category: string;
  name: string;
  description: string | null;
  price: number;
  unit: string;
}

// ── Guest ────────────────────────────────────────────────────────────────────
export function useFolio(reservationId: string, token: string | null, enabled = true) {
  return useQuery({
    queryKey: ["folio", "guest", reservationId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_folio", {
        p_reservation_id: reservationId,
        p_token: token ?? undefined,
      });
      if (error) throw error;
      return data as unknown as Folio;
    },
    refetchInterval: 10_000,
  });
}

/** Services the hotel of a property offers during the stay. */
export function useStayServices(propertyId: string | null | undefined) {
  return useQuery({
    queryKey: ["stay-services", propertyId],
    enabled: !!propertyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: p } = await supabase
        .from("properties")
        .select("tenant_id")
        .eq("id", propertyId!)
        .maybeSingle();
      if (!p) return [];
      const { data, error } = await supabase
        .from("stay_services")
        .select("id, tenant_id, category, name, description, price, unit")
        .eq("tenant_id", p.tenant_id)
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as StayService[];
    },
  });
}

export function useOrderService(reservationId: string, token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (o: { serviceId: string; qty: number; note?: string }) => {
      const { error } = await supabase.rpc("order_service", {
        p_reservation_id: reservationId,
        // null = signed-in member (the generated type marks it required).
        p_token: token as string,
        p_service_id: o.serviceId,
        p_qty: o.qty,
        p_note: o.note,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["folio"] });
      qc.invalidateQueries({ queryKey: ["chat"] });
    },
  });
}

export function useRequestExtension(reservationId: string, token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (newCheckOut: string) => {
      const { data, error } = await supabase.functions.invoke("stays-extend", {
        body: { reservation_id: reservationId, new_check_out: newCheckOut, token },
      });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const body =
          ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
        throw new Error(body?.error ?? "No se pudo solicitar la ampliación");
      }
      return data as { nights: number; amount: number; new_check_out: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["folio"] }),
  });
}

// ── Reception ────────────────────────────────────────────────────────────────
export interface StaffFolio {
  reservation: {
    id: string;
    tenant_id: string;
    status: string;
    start_at: string;
    end_at: string;
    total: number;
    paid_amount: number;
    rooms: { name: string; building: string } | null;
    customers: { name: string | null } | null;
  };
  charges: FolioCharge[];
  extensions: {
    id: string;
    new_check_out: string;
    nights: number;
    amount: number;
    status: string;
  }[];
  balance: number;
}

export function useStaffFolio(reservationId: string | null) {
  return useQuery({
    queryKey: ["folio", "staff", reservationId],
    enabled: !!reservationId,
    queryFn: async (): Promise<StaffFolio> => {
      const [r, c, x] = await Promise.all([
        supabase
          .from("reservations")
          .select(
            "id, tenant_id, status, start_at, end_at, total, paid_amount, rooms(name,building), customers(name)",
          )
          .eq("id", reservationId!)
          .single(),
        supabase
          .from("folio_charges")
          .select(
            "id, category, description, qty, unit_price, amount, status, source, note, created_at, void_reason",
          )
          .eq("reservation_id", reservationId!)
          .order("created_at"),
        supabase
          .from("stay_extensions")
          .select("id, new_check_out, nights, amount, status")
          .eq("reservation_id", reservationId!)
          .eq("status", "pending"),
      ]);
      if (r.error) throw r.error;
      if (c.error) throw c.error;
      const charges = (c.data ?? []) as FolioCharge[];
      const reservation = r.data as unknown as StaffFolio["reservation"];
      const posted = charges
        .filter((x) => x.status === "posted")
        .reduce((s, x) => s + Number(x.amount), 0);
      return {
        reservation,
        charges,
        extensions: (x.data ?? []) as StaffFolio["extensions"],
        balance:
          Math.round((Number(reservation.total) + posted - Number(reservation.paid_amount)) * 100) /
          100,
      };
    },
    refetchInterval: 15_000,
  });
}

export function useFolioActions(reservationId: string, tenantId: string | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const done = () => {
    qc.invalidateQueries({ queryKey: ["folio"] });
    qc.invalidateQueries({ queryKey: ["reservations"] });
  };
  const fail = (e: unknown) => {
    throw new Error((e as { message?: string })?.message ?? "Error");
  };
  return {
    add: useMutation({
      mutationFn: async (c: {
        category: string;
        description: string;
        qty: number;
        unit_price: number;
        service_id?: string | null;
      }) => {
        const { error } = await supabase.from("folio_charges").insert({
          ...c,
          tenant_id: tenantId!,
          reservation_id: reservationId,
          status: "posted",
          source: "staff",
          created_by: user?.id,
        });
        if (error) fail(error);
      },
      onSuccess: done,
    }),
    post: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase
          .from("folio_charges")
          .update({ status: "posted" })
          .eq("id", id);
        if (error) fail(error);
      },
      onSuccess: done,
    }),
    void: useMutation({
      mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
        const { error } = await supabase
          .from("folio_charges")
          .update({ status: "void", void_reason: reason })
          .eq("id", id);
        if (error) fail(error);
      },
      onSuccess: done,
    }),
    decideExtension: useMutation({
      mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
        const { error } = await supabase.rpc("decide_extension", { p_id: id, p_approve: approve });
        if (error) fail(error);
      },
      onSuccess: done,
    }),
    deskPayment: useMutation({
      mutationFn: async ({ amount, method }: { amount: number; method: "cash" | "card" }) => {
        const { error } = await supabase.rpc("record_desk_payment", {
          p_reservation_id: reservationId,
          p_amount: amount,
          p_method: method,
        });
        if (error) fail(error);
      },
      onSuccess: done,
    }),
  };
}
