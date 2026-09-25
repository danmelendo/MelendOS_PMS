import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, PenLine, CheckCircle2, FileSignature } from "lucide-react";
import { toast } from "sonner";
import { pms } from "@/integrations/pms";
import { useMember } from "@/lib/member-session";
import { SignaturePad } from "@/components/SignaturePad";
import { formatDateShort } from "@/lib/stays";

export const Route = createFileRoute("/stays/sign/$bookingId")({
  component: SignScreen,
});

function SignScreen() {
  const { bookingId } = Route.useParams();
  const { member } = useMember();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [signature, setSignature] = useState<string | null>(null);
  const [signerName, setSignerName] = useState(member?.name ?? "");
  const [accepted, setAccepted] = useState(false);

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
      toast.success("Documento firmado · check-in listo");
      navigate({ to: "/stays/booking/$bookingId", params: { bookingId } });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo firmar"),
  });

  const alreadySigned = existing?.status === "signed";

  return (
    <div className="px-5 pt-6">
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/stays/booking/$bookingId", params: { bookingId } })}
          className="flex h-9 w-9 items-center justify-center  bg-white ring-1 ring-neutral-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-lg font-semibold">Check-in online</h1>
      </div>

      <div className="mb-4 flex items-start gap-3  bg-white p-4 shadow-sm ring-1 ring-neutral-100">
        <FileSignature className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand)]" />
        <div className="text-sm">
          <p className="font-medium text-neutral-800">Registro de viajeros y normas del hotel</p>
          {booking && (
            <p className="text-neutral-500">
              {booking.roomName} · {booking.propertyName} · {formatDateShort(booking.checkIn)}–
              {formatDateShort(booking.checkOut)}
            </p>
          )}
        </div>
      </div>

      {alreadySigned ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2  bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-5 w-5" /> Documento ya firmado por {existing?.signerName}
          </div>
          {existing?.signatureData && (
            <img
              src={existing.signatureData}
              alt="Firma"
              className="h-32 w-full  border bg-white object-contain"
            />
          )}
          <button
            onClick={() => navigate({ to: "/stays/booking/$bookingId", params: { bookingId } })}
            className="w-full  bg-[var(--brand)] py-3.5 font-semibold text-white"
          >
            Ver mi reserva
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              Nombre del firmante
            </span>
            <input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="w-full  border border-neutral-200 bg-white px-3 py-2.5 text-sm"
              placeholder="Nombre y apellidos"
            />
          </label>

          <div>
            <span className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
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
            <span>Confirmo que mis datos son correctos y acepto las normas del hotel.</span>
          </label>

          <button
            disabled={!signature || !signerName.trim() || !accepted || submit.isPending}
            onClick={() => submit.mutate()}
            className="w-full  bg-[var(--brand)] py-3.5 font-semibold text-white disabled:opacity-50"
          >
            {submit.isPending ? "Firmando…" : "Firmar y completar check-in"}
          </button>
        </div>
      )}
    </div>
  );
}
