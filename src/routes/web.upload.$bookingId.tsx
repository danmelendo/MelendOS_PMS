import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Upload, FileCheck2, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { pms } from "@/integrations/pms";
import { formatDateShort } from "@/lib/stays";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/web/upload/$bookingId")({
  component: WebUploadScreen,
});

interface DocFile {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

const REQUIRED_DOCS = [
  { id: "dni", label: "DNI o Pasaporte (frontal)", accept: "image/*,application/pdf" },
  { id: "dni_back", label: "DNI o Pasaporte (reverso)", accept: "image/*,application/pdf" },
];

function WebUploadScreen() {
  const { bookingId } = Route.useParams();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<Record<string, DocFile>>({});
  const [submitted, setSubmitted] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const { t } = useLang();

  const { data: booking } = useQuery({
    queryKey: ["pms", "booking", bookingId],
    queryFn: () => pms.getBooking(bookingId),
  });

  const handleFile = (docId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setDocs((prev) => ({
        ...prev,
        [docId]: {
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: e.target?.result as string,
        },
      }));
    };
    reader.readAsDataURL(file);
  };

  const allUploaded = REQUIRED_DOCS.every((d) => docs[d.id]);

  const submit = () => {
    if (!allUploaded) return;
    setSubmitted(true);
    toast.success(t("Documentación enviada correctamente"), {
      description: t("Revisaremos tu documentación en las próximas horas."),
    });
  };

  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/web/sign/$bookingId", params: { bookingId } })}
          className="flex h-10 w-10 items-center justify-center  border border-neutral-200 bg-white text-neutral-700"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-2xl font-bold">{t("Documento de identidad")}</h1>
      </div>

      {booking && (
        <div className="mb-6  bg-neutral-50 px-4 py-3 text-sm text-neutral-600 ring-1 ring-neutral-200">
          <p className="font-semibold">{booking.roomName}</p>
          <p className="text-neutral-500">
            {booking.propertyName} · {formatDateShort(booking.checkIn)} →{" "}
            {formatDateShort(booking.checkOut)}
          </p>
        </div>
      )}

      {submitted ? (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3  bg-emerald-50 px-5 py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="font-semibold text-emerald-800">{t("¡Documentación recibida!")}</p>
            <p className="text-sm text-emerald-700">
              {t("Revisaremos tus documentos y confirmaremos tu check-in en las próximas horas.")}
            </p>
          </div>
          <Link
            to="/web/booking/$bookingId"
            params={{ bookingId }}
            className="flex w-full items-center justify-center  bg-[var(--brand)] py-3.5 font-semibold text-white"
          >
            {t("Ver mi reserva")}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-neutral-500">
            {t("Para completar el check-in necesitamos una copia de tu documento de identidad.")}
          </p>

          {REQUIRED_DOCS.map((doc) => {
            const uploaded = docs[doc.id];
            return (
              <div key={doc.id} className=" bg-white p-5 shadow-sm ring-1 ring-neutral-100">
                <p className="mb-3 text-sm font-semibold text-neutral-700">{t(doc.label)}</p>
                {uploaded ? (
                  <div className="flex items-center gap-3  bg-emerald-50 px-3 py-2.5">
                    <FileCheck2 className="h-5 w-5 shrink-0 text-emerald-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-emerald-700">
                        {uploaded.name}
                      </p>
                      <p className="text-xs text-emerald-600">
                        {(uploaded.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setDocs((prev) => {
                          const next = { ...prev };
                          delete next[doc.id];
                          return next;
                        })
                      }
                      className="text-neutral-400 hover:text-rose-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRefs.current[doc.id]?.click()}
                    className="flex w-full items-center justify-center gap-2  border-2 border-dashed border-neutral-200 py-6 text-sm font-medium text-neutral-500 hover:border-[var(--brand)] hover:text-[var(--brand)] transition"
                  >
                    <Upload className="h-5 w-5" /> {t("Subir archivo")}
                  </button>
                )}
                <input
                  ref={(el) => {
                    fileRefs.current[doc.id] = el;
                  }}
                  type="file"
                  accept={doc.accept}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(doc.id, file);
                  }}
                />
              </div>
            );
          })}

          <div className=" bg-[var(--brand-soft)] px-4 py-3 text-sm text-[var(--brand)]">
            {t(
              "Demo: los archivos se guardan solo en tu navegador y no se envían a ningún servidor.",
            )}
          </div>

          <button
            disabled={!allUploaded}
            onClick={submit}
            className="w-full  bg-[var(--brand)] py-4 font-semibold text-white disabled:opacity-40"
          >
            {t("Enviar documentación")}
          </button>

          <Link
            to="/web/booking/$bookingId"
            params={{ bookingId }}
            className="block text-center text-sm text-neutral-400 underline"
          >
            {t("Hacerlo más tarde")}
          </Link>
        </div>
      )}
    </div>
  );
}
