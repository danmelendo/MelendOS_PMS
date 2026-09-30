import { useCallback, useEffect, useState } from "react";
import { Download, FileSpreadsheet, Loader2, Send } from "lucide-react";
import { sales } from "../lib/supabase";
import {
  ONBOARDING_STATUSES,
  type ClientOnboarding,
  type ClientOnboardingFile,
  type ClientStatus,
} from "../lib/clients";
import { FILE_KINDS, SECTIONS, fieldShown } from "../../supabase/functions/_shared/onboarding.ts";
import { BTN_OUTLINE, BTN_PRIMARY } from "./admin-ui";

// "Formulario de alta" in a customer's drawer: whether it was sent and filled
// in, the answers and the uploaded files (downloaded with a signed URL), to
// resend it and to close it once the hotel is set up, which deletes the files
// (reservations carry guests' personal data).

const TONE: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  sent: "bg-gold/20 text-gold-foreground",
  in_progress: "bg-gold/20 text-gold-foreground",
  submitted: "bg-primary text-primary-foreground",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-muted text-muted-foreground",
};

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-ES", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

function show(v: unknown, options?: { value: string; label: string }[]): string {
  if (v === undefined || v === null || v === "") return "—";
  const label = (x: unknown) => options?.find((o) => o.value === x)?.label ?? String(x);
  if (Array.isArray(v)) return v.map(label).join(", ") || "—";
  return label(v);
}

export function OnboardingSection({
  clientId,
  status,
}: {
  clientId: string;
  status: ClientStatus;
}) {
  const [form, setForm] = useState<ClientOnboarding | null | undefined>(undefined);
  const [files, setFiles] = useState<ClientOnboardingFile[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const load = useCallback(async () => {
    const db = sales();
    const { data } = await db
      .from("client_onboarding")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setForm((data as ClientOnboarding | null) ?? null);
    if (data) {
      const { data: f } = await db
        .from("client_onboarding_files")
        .select("id, kind, name, path, size, created_at")
        .eq("onboarding_id", data.id)
        .order("created_at");
      setFiles((f ?? []) as ClientOnboardingFile[]);
    } else setFiles([]);
  }, [clientId]);

  useEffect(() => {
    void load();
    // A queued form is sent within a minute: look again meanwhile.
    const id = setInterval(() => void load(), 20_000);
    return () => clearInterval(id);
  }, [load]);

  const resend = async () => {
    setBusy("resend");
    setMsg(null);
    const { error } = await sales().rpc("resend_client_onboarding", { p_client: clientId });
    setBusy(null);
    if (error) return setMsg(error.message);
    setMsg("Enviándolo con un enlace nuevo; el anterior deja de valer.");
    void load();
  };

  const download = async (f: ClientOnboardingFile) => {
    const { data, error } = await sales()
      .storage.from("onboarding")
      .createSignedUrl(f.path, 120, { download: f.name });
    if (error || !data) return setMsg(error?.message ?? "No se pudo descargar");
    window.location.href = data.signedUrl;
  };

  const complete = async () => {
    if (!form) return;
    setBusy("complete");
    setMsg(null);
    const db = sales();
    if (files.length) {
      const { error } = await db.storage.from("onboarding").remove(files.map((f) => f.path));
      if (error) {
        setBusy(null);
        return setMsg(`No se pudieron borrar los archivos: ${error.message}`);
      }
      await db.from("client_onboarding_files").delete().eq("onboarding_id", form.id);
    }
    const { error } = await db
      .from("client_onboarding")
      .update({ status: "completed", completed_at: new Date().toISOString(), token_hash: null })
      .eq("id", form.id);
    setBusy(null);
    setConfirmClose(false);
    if (error) return setMsg(error.message);
    void load();
  };

  if (form === undefined) return null;

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold">Formulario de alta</h2>
        {form && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[form.status]}`}
          >
            {ONBOARDING_STATUSES[form.status]}
          </span>
        )}
      </div>
      <div className="rounded-lg border p-3 text-sm">
        {!form ? (
          <p className="text-muted-foreground">
            {status === "onboarding"
              ? "Aún no se ha enviado: falta un email de contacto o de facturación."
              : "Se envía solo al pasar el cliente a «En implantación»."}
          </p>
        ) : (
          <>
            <p className="text-muted-foreground">
              Para {form.email}
              {form.sent_at && ` · enviado ${when(form.sent_at)}`}
              {form.opened_at && ` · abierto ${when(form.opened_at)}`}
              {form.submitted_at && ` · recibido ${when(form.submitted_at)}`}
              {form.completed_at && ` · alta hecha ${when(form.completed_at)}`}
            </p>
            {form.last_error && form.status === "queued" && (
              <p className="mt-1 text-xs text-destructive">
                No se pudo enviar ({form.send_attempts} intentos): {form.last_error}
              </p>
            )}

            {files.length > 0 && (
              <ul className="mt-3 divide-y rounded-md border">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 px-3 py-1.5">
                    <FileSpreadsheet className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="w-28 shrink-0 text-xs text-muted-foreground">
                      {FILE_KINDS.find((k) => k.kind === f.kind)?.label ?? f.kind}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => void download(f)}
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label={`Descargar ${f.name}`}
                    >
                      <Download className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {Object.keys(form.data ?? {}).length > 0 && (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="mt-3 text-xs font-semibold text-primary underline-offset-2 hover:underline"
              >
                {open ? "Ocultar respuestas" : "Ver respuestas"}
              </button>
            )}
            {open && (
              <div className="mt-3 space-y-4">
                {SECTIONS.map((s) => {
                  const values = form.data?.[s.id] ?? {};
                  return (
                    <div key={s.id}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {s.title}
                      </p>
                      <dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        {s.fields
                          .filter((f) => fieldShown(f, values))
                          .map((f) => (
                            <div key={f.key} className="min-w-0">
                              <dt className="text-xs text-muted-foreground">{f.label}</dt>
                              <dd className="break-words">{show(values[f.key], f.options)}</dd>
                            </div>
                          ))}
                      </dl>
                    </div>
                  );
                })}
                {typeof form.data?.extra?.notes === "string" && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Notas
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{form.data.extra.notes as string}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(form ? form.status !== "completed" : status === "onboarding") && (
            <button
              type="button"
              className={BTN_OUTLINE}
              disabled={!!busy}
              onClick={() => void resend()}
            >
              {busy === "resend" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {form ? "Reenviar formulario" : "Enviar formulario"}
            </button>
          )}
          {form?.status === "submitted" &&
            (confirmClose ? (
              <>
                <span className="text-xs">
                  Se borran sus {files.length} archivos y el enlace deja de valer. ¿Seguro?
                </span>
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  disabled={!!busy}
                  onClick={() => void complete()}
                >
                  {busy === "complete" && <Loader2 className="size-4 animate-spin" />}
                  Sí, alta hecha
                </button>
                <button
                  type="button"
                  className={BTN_OUTLINE}
                  onClick={() => setConfirmClose(false)}
                >
                  No
                </button>
              </>
            ) : (
              <button type="button" className={BTN_OUTLINE} onClick={() => setConfirmClose(true)}>
                Marcar alta hecha
              </button>
            ))}
        </div>
        {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}
      </div>
    </section>
  );
}
