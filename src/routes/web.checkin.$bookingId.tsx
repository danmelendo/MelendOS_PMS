import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Baby, CheckCircle2, Lock, Pencil, Plus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { pms } from "@/integrations/pms";
import { guestToken } from "@/integrations/pms/demo-stays-connector";
import { TravellerForm } from "@/components/TravellersDrawer";
import {
  FIELD_LABELS,
  useGuestTravellerSave,
  useGuestTravellers,
  type TravellerRow,
} from "@/lib/ses";
import { formatDateShort } from "@/lib/stays";

// Online check-in, step 1: the guests of the stay for the traveller register
// the law requires (SES.HOSPEDAJES). Same form and checks as reception's; the
// data is never shown back, only names, the last digits of each document and
// what is still missing. Step 2 is signing (/web/sign).

export const Route = createFileRoute("/web/checkin/$bookingId")({
  component: WebCheckinScreen,
});

function WebCheckinScreen() {
  const { bookingId } = Route.useParams();
  const navigate = useNavigate();
  const token = guestToken(bookingId);
  const { data: booking } = useQuery({
    queryKey: ["pms", "booking", bookingId],
    queryFn: () => pms.getBooking(bookingId),
  });
  const { data: travellers, error } = useGuestTravellers(bookingId, token);
  const save = useGuestTravellerSave(bookingId, token);
  const [editing, setEditing] = useState<TravellerRow | "new" | null>(null);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 text-center text-neutral-500">
        No se encontró la reserva. Ábrela desde el enlace de tu email de confirmación.
      </div>
    );
  }
  if (!booking || !travellers) return <div className="min-h-[60vh]" />;

  const people = booking.guests ?? 1;
  const complete = travellers.filter((t) => t.missing.length === 0).length;
  const done = travellers.length >= people && complete === travellers.length;
  const stay = {
    id: booking.id,
    reference: booking.reference ?? "",
    guestName: null,
    checkIn: booking.checkIn.slice(0, 10),
    people,
  };

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/web/booking/$bookingId", params: { bookingId } })}
          className="flex h-10 w-10 items-center justify-center border border-neutral-200 bg-white text-neutral-700"
          aria-label="Volver a la reserva"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Check-in online</h1>
          <p className="text-sm text-neutral-500">
            Paso 1 de 2 · Datos de los viajeros · llegada el {formatDateShort(booking.checkIn)}
          </p>
        </div>
      </div>

      <div className="space-y-3 bg-white p-6 shadow-sm ring-1 ring-neutral-100">
        <p className="text-sm text-neutral-600">
          La ley obliga al hotel a registrar a cada huésped y enviar sus datos al Ministerio del
          Interior (SES.HOSPEDAJES). Rellénalos ahora y en recepción solo te pedirán el documento.
        </p>
        <p className="flex items-start gap-2 text-xs text-neutral-400">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Por seguridad no volvemos a mostrar los datos guardados: si te equivocas, corrige solo lo
          que haga falta.
        </p>

        <ul className="divide-y divide-neutral-100">
          {travellers.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-medium">
                  {t.is_minor ? (
                    <Baby className="h-4 w-4 text-neutral-400" />
                  ) : (
                    <UserRound className="h-4 w-4 text-neutral-400" />
                  )}
                  {[t.first_name, t.last_name1, t.last_name2].filter(Boolean).join(" ")}
                  {t.is_holder && <span className="text-xs text-neutral-400">· titular</span>}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {t.document_type
                    ? `${t.document_type} ${t.document_hint ?? ""}`
                    : "Sin documento"}
                </p>
                {t.missing.length > 0 ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Falta: {t.missing.map((m) => FIELD_LABELS[m] ?? m).join(", ")}
                  </p>
                ) : (
                  <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Completo
                  </p>
                )}
              </div>
              <button
                onClick={() => setEditing(t)}
                className="flex shrink-0 items-center gap-1 text-sm font-medium text-[var(--brand)]"
              >
                <Pencil className="h-3.5 w-3.5" /> Corregir
              </button>
            </li>
          ))}
        </ul>

        {editing ? (
          <TravellerForm
            key={editing === "new" ? "new" : editing.id}
            stay={stay}
            initial={editing === "new" ? null : editing}
            firstOne={travellers.length === 0}
            saving={save.isPending}
            onCancel={() => setEditing(null)}
            onSave={(data) =>
              save.mutate(
                { id: editing === "new" ? undefined : editing.id, data },
                {
                  onSuccess: () => {
                    toast.success("Viajero guardado");
                    setEditing(null);
                  },
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          />
        ) : (
          travellers.length < 12 && (
            <button
              onClick={() => setEditing("new")}
              className="flex w-full items-center justify-center gap-2 border border-dashed border-neutral-300 py-3 text-sm font-semibold text-neutral-700"
            >
              <Plus className="h-4 w-4" />
              {travellers.length === 0 ? "Añadir al titular" : "Añadir otro viajero"}
            </button>
          )
        )}

        <p className="text-xs text-neutral-500">
          {travellers.length} de {people} {people === 1 ? "viajero" : "viajeros"} · {complete}{" "}
          completos
        </p>
      </div>

      <button
        disabled={!done}
        onClick={() => navigate({ to: "/web/sign/$bookingId", params: { bookingId } })}
        className="mt-5 w-full bg-[var(--brand)] py-3 font-semibold text-white disabled:opacity-40"
      >
        Continuar a la firma
      </button>
      {!done && (
        <p className="mt-2 text-center text-xs text-neutral-400">
          Completa los datos de {people === 1 ? "tu estancia" : `los ${people} viajeros`} para
          continuar.
        </p>
      )}
    </div>
  );
}
