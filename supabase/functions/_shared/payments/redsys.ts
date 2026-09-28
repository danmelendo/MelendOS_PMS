// Redsys redirection payments (HMAC_SHA256_V1). Pure TypeScript + WebCrypto,
// runs in Deno (Edge Functions) and Node (tests).
//
// Signature: derive a per-order key with 3DES-CBC(secretKey, order padded with
// zeros to a multiple of 8, IV = 0), then HMAC-SHA256 the base64 merchant
// parameters with that key and base64-encode the result.
import { tripleDesCbcEncrypt } from "./des.ts";

export const REDSYS_URLS = {
  test: "https://sis-t.redsys.es:25443/sis/realizarPago",
  production: "https://sis.redsys.es/sis/realizarPago",
} as const;

export const SIGNATURE_VERSION = "HMAC_SHA256_V1";

function b64ToBytes(b64: string): Uint8Array {
  const normal = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(normal);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function utf8ToB64(text: string): string {
  return bytesToB64(new TextEncoder().encode(text));
}

function b64ToUtf8(b64: string): string {
  return new TextDecoder().decode(b64ToBytes(b64));
}

async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message)));
}

/** Per-order key: 3DES-CBC of the order id with the merchant secret. */
export function deriveOrderKey(secretKeyB64: string, order: string): Uint8Array {
  const orderBytes = new TextEncoder().encode(order);
  const padded = new Uint8Array(Math.ceil(orderBytes.length / 8) * 8);
  padded.set(orderBytes);
  return tripleDesCbcEncrypt(b64ToBytes(secretKeyB64), padded);
}

export async function sign(
  secretKeyB64: string,
  order: string,
  merchantParamsB64: string,
): Promise<string> {
  return bytesToB64(await hmacSha256(deriveOrderKey(secretKeyB64, order), merchantParamsB64));
}

/** Redsys order: 4–12 chars, the first 4 digits. Unique per payment attempt. */
export function buildOrder(now = Date.now(), random = Math.random()): string {
  const digits = String(now).slice(-8);
  const suffix = Math.floor(random * 36 ** 4)
    .toString(36)
    .padStart(4, "0");
  return `${digits}${suffix}`.slice(0, 12);
}

export interface RedsysPaymentRequest {
  merchantCode: string;
  terminal: string;
  secretKeyB64: string;
  order: string;
  /** Amount in euros; sent to Redsys in cents. */
  amount: number;
  notificationUrl: string;
  urlOk: string;
  urlKo: string;
  description?: string;
  environment: keyof typeof REDSYS_URLS;
}

/** The fields the browser posts to Redsys (auto-submitted form). */
export interface RedsysForm {
  url: string;
  fields: {
    Ds_SignatureVersion: string;
    Ds_MerchantParameters: string;
    Ds_Signature: string;
  };
}

export async function buildPaymentForm(req: RedsysPaymentRequest): Promise<RedsysForm> {
  const params = {
    DS_MERCHANT_AMOUNT: String(Math.round(req.amount * 100)),
    DS_MERCHANT_ORDER: req.order,
    DS_MERCHANT_MERCHANTCODE: req.merchantCode,
    DS_MERCHANT_CURRENCY: "978", // EUR
    DS_MERCHANT_TRANSACTIONTYPE: "0", // authorisation
    DS_MERCHANT_TERMINAL: req.terminal,
    DS_MERCHANT_MERCHANTURL: req.notificationUrl,
    DS_MERCHANT_URLOK: req.urlOk,
    DS_MERCHANT_URLKO: req.urlKo,
    ...(req.description ? { DS_MERCHANT_PRODUCTDESCRIPTION: req.description.slice(0, 125) } : {}),
  };
  const merchantParams = utf8ToB64(JSON.stringify(params));
  return {
    url: REDSYS_URLS[req.environment],
    fields: {
      Ds_SignatureVersion: SIGNATURE_VERSION,
      Ds_MerchantParameters: merchantParams,
      Ds_Signature: await sign(req.secretKeyB64, req.order, merchantParams),
    },
  };
}

export interface RedsysNotification {
  order: string;
  /** Amount in euros. */
  amount: number;
  /** Ds_Response: 0000–0099 means authorised. */
  responseCode: number;
  authorised: boolean;
  raw: Record<string, string>;
}

/** Constant-time comparison of two base64 signatures (url-safe or not). */
function sameSignature(a: string, b: string): boolean {
  const x = b64ToBytes(a);
  const y = b64ToBytes(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/**
 * Verifies a Redsys notification (the server-to-server POST). Throws if the
 * signature does not match, so a forged notification can never confirm a
 * reservation.
 */
export async function verifyNotification(
  secretKeyB64: string,
  merchantParamsB64: string,
  signature: string,
): Promise<RedsysNotification> {
  const raw = JSON.parse(b64ToUtf8(merchantParamsB64)) as Record<string, string>;
  const order = raw.Ds_Order ?? raw.DS_ORDER;
  if (!order) throw new Error("Notification without order");
  const expected = await sign(secretKeyB64, order, merchantParamsB64);
  if (!sameSignature(expected, signature)) throw new Error("Invalid Redsys signature");
  const responseCode = Number(raw.Ds_Response ?? raw.DS_RESPONSE ?? "9999");
  return {
    order,
    amount: Number(raw.Ds_Amount ?? raw.DS_AMOUNT ?? "0") / 100,
    responseCode,
    authorised: responseCode >= 0 && responseCode <= 99,
    raw,
  };
}

// ── Refunds (REST, operation type 3) ─────────────────────────────────────────

export const REDSYS_REST_URLS = {
  test: "https://sis-t.redsys.es:25443/sis/rest/trataPeticionREST",
  production: "https://sis.redsys.es/sis/rest/trataPeticionREST",
} as const;

export interface RedsysRefundRequest {
  merchantCode: string;
  terminal: string;
  secretKeyB64: string;
  /** The order of the original payment. */
  order: string;
  /** Euros to give back (at most what was charged). */
  amount: number;
  environment: keyof typeof REDSYS_REST_URLS;
}

/** The signed body of a refund request (the same signature as a payment). */
export async function buildRefundRequest(req: RedsysRefundRequest) {
  const params = {
    DS_MERCHANT_AMOUNT: String(Math.round(req.amount * 100)),
    DS_MERCHANT_ORDER: req.order,
    DS_MERCHANT_MERCHANTCODE: req.merchantCode,
    DS_MERCHANT_CURRENCY: "978",
    DS_MERCHANT_TRANSACTIONTYPE: "3", // refund
    DS_MERCHANT_TERMINAL: req.terminal,
  };
  const merchantParams = utf8ToB64(JSON.stringify(params));
  return {
    url: REDSYS_REST_URLS[req.environment],
    body: {
      Ds_SignatureVersion: SIGNATURE_VERSION,
      Ds_MerchantParameters: merchantParams,
      Ds_Signature: await sign(req.secretKeyB64, req.order, merchantParams),
    },
  };
}

export interface RedsysRefundResult {
  ok: boolean;
  /** Ds_Response (0900 = refund accepted) or the SIS error code. */
  code: string;
}

/**
 * Asks Redsys to give back part or all of a payment. Only an answer signed
 * with the hotel's key and Ds_Response 0900 counts as done.
 */
export async function refund(
  req: RedsysRefundRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<RedsysRefundResult> {
  const { url, body } = await buildRefundRequest(req);
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    errorCode?: string;
    Ds_MerchantParameters?: string;
    Ds_Signature?: string;
  };
  if (json.errorCode) return { ok: false, code: json.errorCode };
  if (!json.Ds_MerchantParameters || !json.Ds_Signature) {
    return { ok: false, code: `HTTP ${res.status}` };
  }
  const answer = await verifyNotification(
    req.secretKeyB64,
    json.Ds_MerchantParameters,
    json.Ds_Signature,
  );
  const code = String(answer.raw.Ds_Response ?? answer.raw.DS_RESPONSE ?? "");
  return { ok: Number(code) === 900, code };
}
