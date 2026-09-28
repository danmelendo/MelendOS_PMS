import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, PenLine, CheckCircle2, FileSignature } from "lucide-react";
import { toast } from "sonner";
import { pms } from "@/integrations/pms";
import { SignaturePad } from "@/components/SignaturePad";
import { formatDateShort } from "@/lib/stays";
import { useLang } from "@/lib/i18n";
import { DEMO_ACCESS } from "@/lib/demo-access";

export const Route = createFileRoute("/web/sign/$bookingId")({
  component: WebSignScreen,
});

function WebSignScreen() {
  const { bookingId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [signature, setSignature] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const { t } = useLang();

  const { data: booking } = useQuery({
    queryKey: ["pms", "booking", bookingId],
    queryFn: () => pms.getBooking(bookingId),
  });
  const { data: existing } = useQuery({
    queryKey: ["pms", "signature", bookingId],
    queryFn: () => pms.getSignature(bookingId),
  });

  const submit = useMutation({
    mutationFn: () =>
      pms.submitSignature(bookingId, "guest_registration", signerName.trim(), signature!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms"] });
      // Uploading documents only exists in the demo (files stay in the
      // browser); elsewhere the check-in ends with the signature.
      if (DEMO_ACCESS) {
        toast.success(t("Documento firmado · sube tu documentación"));
        navigate({ to: "/web/upload/$bookingId", params: { bookingId } });
      } else {
        toast.success(t("Check-in online completado"));
        navigate({ to: "/web/booking/$bookingId", params: { bookingId } });
      }
    },
    onError: (e: Error) => toast.error(t(e.message || "No se pudo firmar")),
  });

  const alreadySigned = existing?.status === "signed";

  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/web/checkin/$bookingId", params: { bookingId } })}
          aria-label={t("Volver")}
          className="flex h-10 w-10 items-center justify-center  border border-neutral-200 bg-white text-neutral-700"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-2xl font-bold">{t("Check-in online")}</h1>
      </div>

      <div className="mb-6 flex items-start gap-3  bg-white p-5 shadow-sm ring-1 ring-neutral-100">
        <FileSignature className="mt-0.5 h-6 w-6 shrink-0 text-[var(--brand)]" />
        <div>
          <p className="font-semibold text-neutral-800">
            {t("Paso 2 de 2 · Registro de viajeros y normas del hotel")}
          </p>
          {booking && (
            <p className="mt-1 text-sm text-neutral-500">
              {booking.roomName} · {booking.propertyName} · {formatDateShort(booking.checkIn)}–
              {formatDateShort(booking.checkOut)}
            </p>
          )}
        </div>
      </div>

      {alreadySigned ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2  bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />{" "}
            {t("Documento ya firmado por {name}", { name: existing?.signerName ?? "" })}
          </div>
          {existing?.signatureData && (
            <img
              src={existing.signatureData}
              alt={t("Firma")}
              className="h-32 w-full  border bg-white object-contain"
            />
          )}
          <button
            onClick={() =>
              DEMO_ACCESS
                ? navigate({ to: "/web/upload/$bookingId", params: { bookingId } })
                : navigate({ to: "/web/booking/$bookingId", params: { bookingId } })
            }
            className="w-full  bg-[var(--brand)] py-4 font-semibold text-white"
          >
            {t(DEMO_ACCESS ? "Continuar · subir documentación" : "Volver a la reserva")}
          </button>
        </div>
      ) : (
        <div className="space-y-5  bg-white p-6 shadow-sm ring-1 ring-neutral-100">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-400">
              {t("Nombre del firmante")}
            </span>
            <input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="w-full  border border-neutral-200 bg-white px-3 py-2.5 text-sm"
              placeholder={t("Nombre y apellidos")}
            />
          </label>

          <div>
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              <PenLine className="h-3 w-3" /> Firma
            </span>
            <SignaturePad onChange={setSignature} />
          </div>

          <label className="flex items-start gap-2.5 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4  border-neutral-300"
            />
            <span>{t("Confirmo que mis datos son correctos y acepto las normas del hotel.")}</span>
          </label>

          <button
            disabled={!signature || !signerName.trim() || !accepted || submit.isPending}
            onClick={() => submit.mutate()}
            className="w-full  bg-[var(--brand)] py-4 font-semibold text-white disabled:opacity-50"
          >
            {t(submit.isPending ? "Firmando…" : "Firmar y completar check-in")}
          </button>
        </div>
      )}
    </div>
  );
}
