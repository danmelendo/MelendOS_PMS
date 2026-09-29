import { useEffect, useRef, useState } from "react";
import { Loader2, Lock, X } from "lucide-react";
import type { PaymentRedirect } from "@/integrations/pms";
import { followPaymentRedirect } from "@/lib/payments";
import { useLang } from "@/lib/i18n";

// The payment gateway shown inline, in an overlay over the hotel's own page,
// so the guest does not jump to another site. The gateway loads inside an
// iframe (Redsys form posted into it, or Stripe URL). If the provider refuses
// to be framed (X-Frame-Options), a fallback button opens it in this window.
// The gateway returns to our checkout page, which, seeing it runs inside the
// frame, posts the result up here (see web.checkout).
export function PaymentModal({
  redirect,
  amountLabel,
  onResult,
  onClose,
}: {
  redirect: PaymentRedirect;
  amountLabel: string;
  onResult: (result: "ok" | "ko") => void;
  onClose: () => void;
}) {
  const { t } = useLang();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const frameName = "melendos-tpv";

  // Post the Redsys form into the iframe, or point it at the Stripe URL.
  useEffect(() => {
    if (redirect.kind === "form") formRef.current?.submit();
    else if (frameRef.current) frameRef.current.src = redirect.url;
  }, [redirect]);

  // The return page (same origin) tells us how it went.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const r = (e.data as { melendos_payment?: "ok" | "ko" })?.melendos_payment;
      if (r === "ok" || r === "ko") onResult(r);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onResult]);

  // If the gateway does not render in the frame within a few seconds, offer to
  // open it in this window instead (some banks block being framed).
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!loaded) setBlocked(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [loaded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/60 p-3">
      <div className="flex h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
            <Lock className="h-4 w-4 text-neutral-500" /> {t("Pago seguro")} · {amountLabel}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Cerrar")}
            className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative flex-1">
          {!loaded && !blocked && (
            <div className="absolute inset-0 flex items-center justify-center text-neutral-500">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {blocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-neutral-600">
                {t("Tu banco abre el pago en una ventana propia.")}
              </p>
              <button
                type="button"
                onClick={() => followPaymentRedirect(redirect)}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
              >
                {t("Continuar al pago seguro")}
              </button>
            </div>
          )}
          <iframe
            ref={frameRef}
            name={frameName}
            title={t("Pago seguro")}
            onLoad={() => setLoaded(true)}
            // Let the gateway offer Google Pay / Apple Pay inside the frame.
            allow="payment *"
            className="h-full w-full"
          />
        </div>
      </div>

      {redirect.kind === "form" && (
        <form
          ref={formRef}
          action={redirect.url}
          method="POST"
          target={frameName}
          className="hidden"
        >
          {Object.entries(redirect.fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
        </form>
      )}
    </div>
  );
}
