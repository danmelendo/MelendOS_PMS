// Payment gateway abstraction. Each tenant picks a provider; the Edge Functions
// only talk to this interface, so adding a provider means adding one adapter.
//
// Rule shared by every provider: the browser redirect never confirms anything.
// A reservation is confirmed only from a verified server-to-server
// notification (verifyNotification).
import * as redsys from "./redsys.ts";
import * as stripe from "./stripe.ts";

export type Provider = "redsys" | "stripe";

export interface CreatePaymentInput {
  /** Our payment id; echoed back by the provider (metadata / order map). */
  paymentId: string;
  amount: number;
  currency: string;
  description: string;
  notificationUrl: string;
  okUrl: string;
  koUrl: string;
}

export type PaymentRedirect =
  | { kind: "form"; url: string; fields: Record<string, string> }
  | { kind: "url"; url: string };

export interface CreatedPayment {
  providerRef: string;
  redirect: PaymentRedirect;
}

export interface VerifiedNotification {
  providerRef: string;
  /** Amount the provider says was charged, in euros (null if not reported). */
  amount: number | null;
  succeeded: boolean;
  raw: unknown;
}

export interface RefundResult {
  ok: boolean;
  /** The provider's reference or answer code, kept with the refund. */
  reference: string | null;
  /** Why it failed (the provider's words), when it did. */
  error?: string;
}

export interface PaymentGateway {
  readonly provider: Provider;
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  /** Throws if the notification is not authentic. */
  verifyNotification(req: Request): Promise<VerifiedNotification | null>;
  /** Gives back part or all of a payment (providerRef of that payment). */
  refund(providerRef: string, amount: number): Promise<RefundResult>;
}

export interface RedsysConfig {
  merchantCode: string;
  terminal: string;
  secretKeyB64: string;
  environment: "test" | "production";
}

export function redsysGateway(cfg: RedsysConfig): PaymentGateway {
  return {
    provider: "redsys",
    async createPayment(input) {
      const order = redsys.buildOrder();
      const { merchantCode, terminal, secretKeyB64 } = cfg;
      const form = await redsys.buildPaymentForm({
        merchantCode,
        terminal,
        secretKeyB64,
        order,
        amount: input.amount,
        notificationUrl: input.notificationUrl,
        urlOk: input.okUrl,
        urlKo: input.koUrl,
        description: input.description,
        environment: cfg.environment,
      });
      return { providerRef: order, redirect: { kind: "form", url: form.url, fields: form.fields } };
    },
    async refund(providerRef, amount) {
      const r = await redsys.refund({
        merchantCode: cfg.merchantCode,
        terminal: cfg.terminal,
        secretKeyB64: cfg.secretKeyB64,
        order: providerRef,
        amount,
        environment: cfg.environment,
      });
      return r.ok
        ? { ok: true, reference: r.code }
        : {
            ok: false,
            reference: r.code,
            // SIS0295: two operations on the same payment too close together.
            error:
              r.code === "SIS0295"
                ? "Redsys no admite dos operaciones seguidas sobre el mismo pago; inténtalo en un minuto"
                : `Redsys ${r.code}`,
          };
    },
    async verifyNotification(req) {
      // Redsys posts application/x-www-form-urlencoded.
      const form = new URLSearchParams(await req.text());
      const params = form.get("Ds_MerchantParameters");
      const signature = form.get("Ds_Signature");
      if (!params || !signature) throw new Error("Malformed Redsys notification");
      const n = await redsys.verifyNotification(cfg.secretKeyB64, params, signature);
      return { providerRef: n.order, amount: n.amount, succeeded: n.authorised, raw: n.raw };
    },
  };
}

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
}

export function stripeGateway(cfg: StripeConfig, fetchImpl: typeof fetch = fetch): PaymentGateway {
  return {
    provider: "stripe",
    async createPayment(input) {
      const session = await stripe.createCheckoutSession(
        {
          secretKey: cfg.secretKey,
          amount: input.amount,
          currency: input.currency,
          description: input.description,
          successUrl: input.okUrl,
          cancelUrl: input.koUrl,
          metadata: { payment_id: input.paymentId },
        },
        fetchImpl,
      );
      return { providerRef: session.id, redirect: { kind: "url", url: session.url } };
    },
    async refund(providerRef, amount) {
      const r = await stripe.refundCheckoutSession(cfg.secretKey, providerRef, amount);
      return r.ok ? { ok: true, reference: r.id } : { ok: false, reference: r.id, error: r.error };
    },
    async verifyNotification(req) {
      const body = await req.text();
      const event = await stripe.verifyWebhook(
        body,
        req.headers.get("stripe-signature"),
        cfg.webhookSecret,
      );
      const obj = event.data.object;
      if (event.type === "checkout.session.completed") {
        return {
          providerRef: String(obj.id),
          amount: typeof obj.amount_total === "number" ? obj.amount_total / 100 : null,
          succeeded: obj.payment_status === "paid",
          raw: event,
        };
      }
      if (event.type === "checkout.session.expired") {
        return { providerRef: String(obj.id), amount: null, succeeded: false, raw: event };
      }
      return null; // other events are acknowledged and ignored
    },
  };
}
