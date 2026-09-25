// POST /payments-notify?tenant=<uuid>&provider=redsys|stripe
//
// Server-to-server notification from the payment provider. Public endpoint
// (verify_jwt = false): its authentication is the provider's signature, which
// is verified with the tenant's own secret before anything is written. The
// confirmation itself (confirm_payment) is idempotent and checks the amount.
import { adminClient, json } from "../_shared/http.ts";
import { loadGateway } from "../_shared/payments/accounts.ts";
import type { Provider } from "../_shared/payments/gateway.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenant");
  const provider = url.searchParams.get("provider") as Provider | null;
  if (!tenantId || (provider !== "redsys" && provider !== "stripe")) {
    return json({ error: "tenant and provider are required" }, 400);
  }

  const db = adminClient();
  let gateway;
  try {
    gateway = await loadGateway(db, tenantId, provider);
  } catch {
    return json({ error: "Unknown gateway" }, 404);
  }

  let verified;
  try {
    verified = await gateway.verifyNotification(req);
  } catch (e) {
    console.warn(`Rejected ${provider} notification: ${(e as Error).message}`);
    return json({ error: "Invalid notification" }, 400);
  }
  if (!verified) return json({ received: true }); // event we don't act on

  // The payment must belong to the tenant whose secret verified the message.
  const { data: payment } = await db
    .from("payments")
    .select("id, tenant_id")
    .eq("provider", provider)
    .eq("provider_ref", verified.providerRef)
    .maybeSingle();
  if (!payment || payment.tenant_id !== tenantId) {
    console.warn(`Notification for unknown payment ${provider}/${verified.providerRef}`);
    return json({ received: true });
  }

  const { data: result, error } = await db.rpc("confirm_payment", {
    p_provider: provider,
    p_ref: verified.providerRef,
    p_amount: verified.amount,
    p_succeeded: verified.succeeded,
    p_raw: verified.raw as Record<string, unknown>,
  });
  if (error) {
    console.error(`confirm_payment failed: ${error.message}`);
    // Non-2xx makes the provider retry later.
    return json({ error: "Could not record the payment" }, 500);
  }
  console.log(`Payment ${provider}/${verified.providerRef}: ${result}`);
  return json({ received: true, result });
});
