import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reservar-ok")({
  component: RedsysReturnPage,
  validateSearch: (s: Record<string, unknown>) => ({
    order: typeof s.order === "string" ? s.order : undefined,
    ko: s.ko === "1" || s.ko === "true" ? true : undefined,
  }),
  head: () => ({
    meta: [{ title: "Pago · Melend/OS" }],
  }),
});

function RedsysReturnPage() {
  const { order, ko } = Route.useSearch();
  const failed = !!ko;

  useEffect(() => {
    if (!failed || !order) return;
    (async () => {
      // Payment failed/cancelled: mark the (still unpaid) reservation as
      // "rejected" so it is kept for the record but no longer blocks the slot.
      // The redsys-notification webhook also does this server-side; this is the
      // client-side fallback for the browser redirect to URL_KO.
      const { data } = await supabase
        .from("reservations")
        .select("id")
        .eq("redsys_order", order)
        .eq("deposit_paid", false)
        .maybeSingle();
      if (data?.id) {
        await supabase.from("reservations").update({ status: "rejected" }).eq("id", data.id);
      }
    })();
  }, [failed, order]);

  return (
    <div
      style={{
        fontFamily: "'DM Sans', sans-serif",
        background: "#faf7f2",
        minHeight: "100svh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        color: "#1a1410",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');`}</style>

      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(184,151,90,0.25)",
          borderRadius: 20,
          padding: "48px 40px",
          maxWidth: 460,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 8px 48px rgba(26,20,16,0.07)",
        }}
      >
        {failed ? (
          <>
            <XCircle size={48} color="#ef4444" style={{ marginBottom: 20 }} />
            <h1
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 36,
                fontWeight: 500,
                marginBottom: 12,
              }}
            >
              Pago no completado
            </h1>
            <p style={{ fontSize: 15, color: "#7a6e62", lineHeight: 1.65, marginBottom: 8 }}>
              El pago no se ha podido procesar. Tu reserva no ha sido confirmada.
            </p>
            <p style={{ fontSize: 13, color: "#7a6e62", lineHeight: 1.65, marginBottom: 32 }}>
              Puedes intentarlo de nuevo o contactarnos si el problema persiste.
            </p>
          </>
        ) : (
          <>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: "rgba(184,151,90,0.12)",
                border: "1px solid rgba(184,151,90,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 24px",
              }}
            >
              <CheckCircle2 size={32} color="#b8975a" />
            </div>
            <h1
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 42,
                fontWeight: 500,
                marginBottom: 14,
              }}
            >
              ¡Reserva
              <br />
              confirmada!
            </h1>
            <p style={{ fontSize: 15, color: "#7a6e62", lineHeight: 1.65, marginBottom: 8 }}>
              Tu pago ha sido procesado correctamente. Te enviaremos un email de confirmación con
              todos los detalles.
            </p>
            <p style={{ fontSize: 13, color: "#7a6e62", lineHeight: 1.65, marginBottom: 8 }}>
              Si no lo encuentras, revisa la carpeta de spam.
            </p>
            {order && (
              <p style={{ fontSize: 12, color: "#9a8e82", marginTop: 4, letterSpacing: "0.06em" }}>
                Referencia de pago: {order}
              </p>
            )}
          </>
        )}

        <Link
          to="/web"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#1a1410",
            color: "#d4b483",
            border: "none",
            borderRadius: 10,
            height: 52,
            padding: "0 32px",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textDecoration: "none",
            marginTop: 8,
          }}
        >
          {failed ? "Intentar de nuevo" : "Hacer otra reserva"}
        </Link>
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: "#9a8e82" }}>
        Melend/OS · Pago seguro procesado por Redsys
      </p>
    </div>
  );
}
