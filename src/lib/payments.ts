import type { PaymentRedirect } from "@/integrations/pms";

/** Sends the browser to the payment gateway (auto-posted form or URL). */
export function followPaymentRedirect(redirect: PaymentRedirect) {
  if (redirect.kind === "url") {
    window.location.assign(redirect.url);
    return;
  }
  const form = document.createElement("form");
  form.method = "POST";
  form.action = redirect.url;
  for (const [name, value] of Object.entries(redirect.fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

/** Search params the gateway adds when sending the guest back. */
export function paymentReturnSearch(s: Record<string, unknown>): { payment?: "ok" | "ko" } {
  return s.payment === "ok" || s.payment === "ko" ? { payment: s.payment } : {};
}
