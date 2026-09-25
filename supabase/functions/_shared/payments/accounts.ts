// Loads a tenant's payment gateway (config + Vault secrets) as a PaymentGateway.
// Server-side only: uses the service-role client.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { type PaymentGateway, type Provider, redsysGateway, stripeGateway } from "./gateway.ts";

interface PaymentAccountRow {
  provider: Provider;
  test_mode: boolean;
  public_config: Record<string, string>;
  secret_name: string | null;
}

async function secret(db: SupabaseClient, name: string): Promise<string> {
  const { data, error } = await db.rpc("get_payment_secret", { p_name: name });
  if (error || !data) throw new Error(`Payment secret ${name} is not configured`);
  return data as string;
}

export async function loadGateway(
  db: SupabaseClient,
  tenantId: string,
  provider?: Provider,
): Promise<PaymentGateway> {
  let q = db
    .from("payment_accounts")
    .select("provider, test_mode, public_config, secret_name")
    .eq("tenant_id", tenantId)
    .eq("active", true);
  if (provider) q = q.eq("provider", provider);
  const { data, error } = await q.limit(1).maybeSingle<PaymentAccountRow>();
  if (error) throw error;
  if (!data || !data.secret_name) throw new Error("No active payment gateway for this hotel");

  if (data.provider === "redsys") {
    return redsysGateway({
      merchantCode: data.public_config.merchant_code,
      terminal: data.public_config.terminal ?? "1",
      secretKeyB64: await secret(db, data.secret_name),
      // The demo never talks to production endpoints.
      environment: data.test_mode ? "test" : "production",
    });
  }
  const [secretKey, webhookSecret] = await Promise.all([
    secret(db, `${data.secret_name}/secret_key`),
    secret(db, `${data.secret_name}/webhook_secret`),
  ]);
  return stripeGateway({ secretKey, webhookSecret });
}
