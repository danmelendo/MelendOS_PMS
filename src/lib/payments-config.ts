import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// The hotel's payment gateway (TPV), configured from the panel. Reads and
// writes go through admin-only SQL functions (payment_account_status,
// save_payment_account); the secret key only travels up, never back down.

export type Provider = "redsys" | "stripe";

export interface PaymentAccount {
  configured: boolean;
  provider?: Provider;
  test_mode?: boolean;
  has_secret?: boolean;
  public_config?: Record<string, string>;
}

export function usePaymentAccount(hotelId: string | null) {
  return useQuery({
    queryKey: ["payment-account", hotelId],
    enabled: !!hotelId,
    queryFn: async (): Promise<PaymentAccount> => {
      const { data, error } = await supabase.rpc("payment_account_status", { p_tenant: hotelId! });
      if (error) throw error;
      return (data ?? { configured: false }) as unknown as PaymentAccount;
    },
  });
}

export interface SavePaymentInput {
  tenant: string;
  provider: Provider;
  test_mode: boolean;
  config: Record<string, string>;
  secret?: string;
  secret2?: string;
}

export function useSavePaymentAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SavePaymentInput) => {
      const { error } = await supabase.rpc("save_payment_account", {
        p_tenant: input.tenant,
        p_provider: input.provider,
        p_test_mode: input.test_mode,
        p_config: input.config,
        p_secret: input.secret ?? undefined,
        p_secret2: input.secret2 ?? undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["payment-account", v.tenant] }),
  });
}

export function useDisablePaymentAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tenant: string) => {
      const { error } = await supabase.rpc("disable_payment_account", { p_tenant: tenant });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, tenant) => qc.invalidateQueries({ queryKey: ["payment-account", tenant] }),
  });
}

// The banks whose TPV virtual runs on Redsys (a hint list; the hotel can type
// another). Endpoints are shared, so only the credentials differ per bank.
export const REDSYS_BANKS = [
  "CaixaBank",
  "BBVA",
  "Banco Santander",
  "Banco Sabadell",
  "Bankinter",
  "Unicaja",
  "Abanca",
  "Ibercaja",
  "Kutxabank",
  "Cajamar",
  "Redsys (otro banco)",
];
