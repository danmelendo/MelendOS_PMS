import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { redsysGateway, stripeGateway } from "./gateway.ts";
import { sign } from "./redsys.ts";
import { signWebhookForTest, verifyWebhook } from "./stripe.ts";

const REDSYS = {
  merchantCode: "999008881",
  terminal: "1",
  secretKeyB64: randomBytes(24).toString("base64"),
  environment: "test" as const,
};
const WHSEC = "whsec_test_secret";

const input = {
  paymentId: "pay-1",
  amount: 39.6,
  currency: "EUR",
  description: "Señal reserva",
  notificationUrl: "https://example.test/notify",
  okUrl: "https://example.test/ok",
  koUrl: "https://example.test/ko",
};

describe("Redsys gateway", () => {
  it("creates a form redirect and verifies its own notification", async () => {
    const gw = redsysGateway(REDSYS);
    const created = await gw.createPayment(input);
    expect(created.redirect.kind).toBe("form");

    const params = Buffer.from(
      JSON.stringify({ Ds_Order: created.providerRef, Ds_Amount: "3960", Ds_Response: "0000" }),
    ).toString("base64");
    const body = new URLSearchParams({
      Ds_SignatureVersion: "HMAC_SHA256_V1",
      Ds_MerchantParameters: params,
      Ds_Signature: await sign(REDSYS.secretKeyB64, created.providerRef, params),
    });
    const verified = await gw.verifyNotification(
      new Request("https://x", { method: "POST", body }),
    );
    expect(verified).toMatchObject({
      providerRef: created.providerRef,
      amount: 39.6,
      succeeded: true,
    });
  });

  it("rejects a forged notification", async () => {
    const params = Buffer.from(
      JSON.stringify({ Ds_Order: "1234abcd", Ds_Amount: "3960", Ds_Response: "0000" }),
    ).toString("base64");
    const body = new URLSearchParams({ Ds_MerchantParameters: params, Ds_Signature: "Zm9yZ2Vk" });
    await expect(
      redsysGateway(REDSYS).verifyNotification(new Request("https://x", { method: "POST", body })),
    ).rejects.toThrow();
  });
});

describe("Stripe gateway", () => {
  it("creates a Checkout session with the amount in cents and our payment id", async () => {
    let sent: URLSearchParams | undefined;
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      sent = init.body as URLSearchParams;
      return new Response(JSON.stringify({ id: "cs_test_1", url: "https://checkout.test/cs_1" }));
    }) as unknown as typeof fetch;
    const created = await stripeGateway(
      { secretKey: "sk_test", webhookSecret: WHSEC },
      fakeFetch,
    ).createPayment(input);
    expect(created).toEqual({
      providerRef: "cs_test_1",
      redirect: { kind: "url", url: "https://checkout.test/cs_1" },
    });
    expect(sent?.get("line_items[0][price_data][unit_amount]")).toBe("3960");
    expect(sent?.get("metadata[payment_id]")).toBe("pay-1");
  });

  it("confirms only a correctly signed checkout.session.completed", async () => {
    const event = JSON.stringify({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_1", payment_status: "paid", amount_total: 3960 } },
    });
    const header = await signWebhookForTest(event, WHSEC);
    const gw = stripeGateway({ secretKey: "sk_test", webhookSecret: WHSEC });
    const ok = await gw.verifyNotification(
      new Request("https://x", {
        method: "POST",
        body: event,
        headers: { "stripe-signature": header },
      }),
    );
    expect(ok).toMatchObject({ providerRef: "cs_test_1", amount: 39.6, succeeded: true });

    const forged = await signWebhookForTest(event, "whsec_other");
    await expect(
      gw.verifyNotification(
        new Request("https://x", {
          method: "POST",
          body: event,
          headers: { "stripe-signature": forged },
        }),
      ),
    ).rejects.toThrow(/signature/);
  });

  it("rejects stale webhooks (replay protection)", async () => {
    const body = JSON.stringify({ id: "evt", type: "x", data: { object: {} } });
    const old = await signWebhookForTest(body, WHSEC, 1_700_000_000);
    await expect(verifyWebhook(body, old, WHSEC, 1_700_000_000 + 3600)).rejects.toThrow(/Stale/);
  });
});
