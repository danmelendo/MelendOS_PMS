// Stripe Checkout payments through the REST API (no SDK), for Deno and Node.

const API = "https://api.stripe.com/v1";
/** Webhook timestamps older than this are rejected (replay protection). */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export interface StripeCheckoutRequest {
  secretKey: string;
  /** Amount in euros; sent to Stripe in cents. */
  amount: number;
  currency: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
}

export async function createCheckoutSession(
  req: StripeCheckoutRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<StripeCheckoutSession> {
  const body = new URLSearchParams({
    mode: "payment",
    success_url: req.successUrl,
    cancel_url: req.cancelUrl,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": req.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(Math.round(req.amount * 100)),
    "line_items[0][price_data][product_data][name]": req.description.slice(0, 250),
  });
  for (const [k, v] of Object.entries(req.metadata)) {
    body.set(`metadata[${k}]`, v);
    body.set(`payment_intent_data[metadata][${k}]`, v);
  }
  const res = await fetchImpl(`${API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await res.json()) as { id?: string; url?: string; error?: { message: string } };
  if (!res.ok || !json.id || !json.url) {
    throw new Error(`Stripe error: ${json.error?.message ?? res.status}`);
  }
  return { id: json.id, url: json.url };
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
  );
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/**
 * Verifies the Stripe-Signature header ("t=…,v1=…") over the raw body and
 * returns the parsed event. Throws on a bad or stale signature.
 */
export async function verifyWebhook(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<StripeEvent> {
  if (!signatureHeader) throw new Error("Missing Stripe-Signature header");
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.split("=", 2) as [string, string]),
  );
  const t = Number(parts.t);
  const v1s = signatureHeader
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  if (!t || v1s.length === 0) throw new Error("Malformed Stripe-Signature header");
  if (Math.abs(nowSeconds - t) > WEBHOOK_TOLERANCE_SECONDS) {
    throw new Error("Stale Stripe webhook");
  }
  const expected = await hmacHex(webhookSecret, `${t}.${rawBody}`);
  if (!v1s.some((v) => constantTimeEqual(v, expected))) {
    throw new Error("Invalid Stripe signature");
  }
  return JSON.parse(rawBody) as StripeEvent;
}

/** Helper for tests and local tooling: a valid header for a body. */
export async function signWebhookForTest(
  rawBody: string,
  webhookSecret: string,
  t = Math.floor(Date.now() / 1000),
): Promise<string> {
  return `t=${t},v1=${await hmacHex(webhookSecret, `${t}.${rawBody}`)}`;
}
