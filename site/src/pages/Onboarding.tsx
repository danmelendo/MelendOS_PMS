import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, FileSpreadsheet, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { Logo } from "../components/Layout";
import { SALES } from "../config";
import { sales } from "../lib/supabase";
import {
  fileKindsFor,
  MAX_FILE_BYTES,
  SECTIONS,
  fieldShown,
  onboardingProblems,
  type Field,
  type FileKind,
  type FileKindDef,
  type OnboardingData,
} from "../../supabase/functions/_shared/onboarding.ts";

// The onboarding form a customer fills in after signing (/alta/?t=…). The link
// is the only credential; the onboarding function checks it on every call.
// Answers save themselves as a draft; the last step sends them to us.

const FIELD =
  "mt-1.5 block w-full rounded-lg border border-input bg-card px-3 text-sm font-normal shadow-[var(--shadow-rest)] focus-visible:outline-2 focus-visible:outline-ring";

interface FileRow {
  id: string;
  kind: FileKind;
  name: string;
  size: number;
}

interface Loaded {
  client: { name: string };
  status: "open" | "submitted";
  submitted_at: string | null;
  expires_at: string;
  data: OnboardingData;
  files: FileRow[];
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly problems: string[] = [],
  ) {
    super(message);
  }
}

const token = () => new URLSearchParams(window.location.search).get("t") ?? "";

async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!SALES.url || !SALES.key) throw new ApiError("El formulario no está configurado.");
  let res: Response;
  try {
    res = await fetch(`${SALES.url}/functions/v1/onboarding`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SALES.key,
        Authorization: `Bearer ${SALES.key}`,
      },
      body: JSON.stringify({ ...body, t: token() }),
    });
  } catch {
    throw new ApiError("Sin conexión. Inténtalo de nuevo en un momento.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "No se pudo guardar.", data.problems ?? []);
  return data as T;
}

const kb = (n: number) =>
  n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;

const STEPS = [
  ...SECTIONS.map((s) => ({ id: s.id, title: s.title })),
  { id: "files", title: "Archivos" },
  { id: "send", title: "Enviar" },
];

export function OnboardingPage() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [data, setData] = useState<OnboardingData>({});
  const [files, setFiles] = useState<FileRow[]>([]);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitted, setSubmitted] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (!token()) {
      setFatal("Falta el enlace completo. Ábrelo desde el email que te enviamos.");
      return;
    }
    call<Loaded>({ action: "load" })
      .then((r) => {
        setLoaded(r);
        setData(r.data ?? {});
        setFiles(r.files ?? []);
        setSubmitted(r.status === "submitted");
      })
      .catch((e: Error) => setFatal(e.message));
  }, []);

  // Autosave: a draft a moment after the last change.
  useEffect(() => {
    if (!loaded || !dirty.current) return;
    setSaving("saving");
    const id = setTimeout(() => {
      call({ action: "save", data })
        .then(() => setSaving("saved"))
        .catch(() => setSaving("error"));
    }, 1200);
    return () => clearTimeout(id);
  }, [data, loaded]);

  const setValue = useCallback((section: string, key: string, value: unknown) => {
    dirty.current = true;
    setData((d) => ({ ...d, [section]: { ...(d[section] ?? {}), [key]: value } }));
  }, []);

  const go = (i: number) => {
    setStep(i);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (fatal)
    return (
      <Shell>
        <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-[var(--shadow-rest)]">
          <h1 className="font-display text-2xl">No podemos abrir el formulario</h1>
          <p className="mt-3 text-muted-foreground">{fatal}</p>
        </div>
      </Shell>
    );
  if (!loaded)
    return (
      <Shell>
        <p className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Cargando tu formulario…
        </p>
      </Shell>
    );

  const current = STEPS[step];
  const section = SECTIONS.find((s) => s.id === current.id);

  return (
    <Shell>
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wider text-gold-foreground">
          Alta en Melend/OS
        </p>
        <h1 className="mt-1 font-display text-3xl sm:text-4xl">{loaded.client.name}</h1>
        <p className="mt-2 text-muted-foreground">
          Con estos datos preparamos tu alojamiento. Se guarda solo: puedes dejarlo a medias y
          volver con el mismo enlace hasta el{" "}
          {new Date(loaded.expires_at).toLocaleDateString("es-ES", {
            day: "numeric",
            month: "long",
          })}
          .
        </p>

        <ol className="mt-6 flex flex-wrap gap-1.5" aria-label="Pasos">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === step ? "step" : undefined}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${i === step ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
              >
                {i + 1}. {s.title}
              </button>
            </li>
          ))}
        </ol>

        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-rest)] sm:p-8">
          {section && (
            <>
              <h2 className="font-display text-2xl">{section.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{section.intro}</p>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                {section.fields
                  .filter((f) => fieldShown(f, data[section.id] ?? {}))
                  .map((f) => (
                    <FieldInput
                      key={f.key}
                      field={f}
                      value={(data[section.id] ?? {})[f.key]}
                      accent={(data.web?.accent as string | undefined) ?? "#16233f"}
                      name={
                        (data.establishment?.trade_name as string | undefined) || loaded.client.name
                      }
                      onChange={(v) => setValue(section.id, f.key, v)}
                    />
                  ))}
              </div>
              {section.id === "web" && (
                <>
                  {data.web?.web_mode === "template" && (
                    <WebPreview
                      accent={(data.web?.accent as string | undefined) ?? "#16233f"}
                      name={
                        (data.establishment?.trade_name as string | undefined) || loaded.client.name
                      }
                      tagline={(data.web?.tagline as string | undefined) ?? ""}
                    />
                  )}
                  <FileBoxes kinds={fileKindsFor(data, "web")} files={files} setFiles={setFiles} />
                </>
              )}
            </>
          )}
          {current.id === "files" && (
            <>
              <h2 className="font-display text-2xl">Archivos</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Hasta 20 MB cada uno. Los usamos solo para preparar tu alta y los borramos después.
              </p>
              <FileBoxes kinds={fileKindsFor(data, "files")} files={files} setFiles={setFiles} />
            </>
          )}
          {current.id === "send" && (
            <SendStep
              data={data}
              files={files}
              submitted={submitted}
              onNotes={(v) => {
                dirty.current = true;
                setData((d) => ({ ...d, extra: { notes: v } }));
              }}
              onSubmitted={() => setSubmitted(true)}
              goTo={(id) => go(STEPS.findIndex((s) => s.id === id))}
            />
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => go(step - 1)}
            className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {saving === "saving" && "Guardando…"}
            {saving === "saved" && "Guardado"}
            {saving === "error" && "No se ha podido guardar; lo reintentamos al cambiar algo."}
          </span>
          {step < STEPS.length - 1 && (
            <button
              type="button"
              onClick={() => go(step + 1)}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Siguiente
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100svh] bg-ivory">
      <header className="border-b border-border/70 bg-ivory/85">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4 sm:h-16 sm:px-6">
          <Logo />
        </div>
      </header>
      <main className="px-4 py-8 sm:px-6 sm:py-12">{children}</main>
    </div>
  );
}

function FieldInput({
  field: f,
  value,
  onChange,
  accent,
  name,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  accent: string;
  name: string;
}) {
  const id = `f-${f.key}`;
  const wide = ["textarea", "emails", "multi"].includes(f.type) || f.key === "email_header";
  const label = (
    <label htmlFor={id} className="text-sm font-semibold">
      {f.label}
      {f.required && <span className="text-gold-foreground"> *</span>}
    </label>
  );
  const help = f.help && <p className="mt-1 text-xs text-muted-foreground">{f.help}</p>;
  let input: React.ReactNode;
  if (f.key === "email_header") {
    input = (
      <HeaderChoice
        value={value as string | undefined}
        onChange={onChange}
        accent={accent}
        name={name}
      />
    );
  } else if (f.type === "select") {
    input = (
      <select
        id={id}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className={`${FIELD} h-11`}
      >
        <option value="">Elige…</option>
        {f.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (f.type === "multi") {
    const list = Array.isArray(value) ? (value as string[]) : [];
    input = (
      <div className="mt-2 flex flex-wrap gap-2">
        {f.options?.map((o) => {
          const on = list.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? list.filter((x) => x !== o.value) : [...list, o.value])}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${on ? "border-primary bg-primary/5 font-semibold" : "border-border bg-card"}`}
            >
              <span
                className={`grid size-4 place-items-center rounded border ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
              >
                {on && <Check className="size-3" />}
              </span>
              {o.label}
            </button>
          );
        })}
      </div>
    );
  } else if (f.type === "emails" || f.type === "textarea") {
    const text = Array.isArray(value) ? (value as string[]).join("\n") : ((value as string) ?? "");
    input = (
      <textarea
        id={id}
        rows={f.type === "emails" ? 3 : 4}
        value={text}
        placeholder={f.type === "emails" ? "nombre@tuhotel.com" : f.placeholder}
        onChange={(e) =>
          onChange(f.type === "emails" ? e.target.value.split(/\n/) : e.target.value)
        }
        className={`${FIELD} py-2`}
      />
    );
  } else if (f.type === "color") {
    input = (
      <div className="mt-1.5 flex items-center gap-3">
        <input
          id={id}
          type="color"
          value={(value as string) ?? "#16233f"}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-16 cursor-pointer rounded-lg border border-input bg-card p-1"
        />
        <span className="font-mono text-sm text-muted-foreground">
          {(value as string) ?? "Sin elegir"}
        </span>
      </div>
    );
  } else if (f.type === "hour") {
    input = (
      <select
        id={id}
        value={value === undefined ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className={`${FIELD} h-11`}
      >
        <option value="">Elige…</option>
        {Array.from({ length: 24 }, (_, h) => (
          <option key={h} value={h}>
            {String(h).padStart(2, "0")}:00
          </option>
        ))}
      </select>
    );
  } else {
    input = (
      <input
        id={id}
        type={f.type === "number" ? "number" : f.type === "url" ? "url" : f.type}
        inputMode={f.type === "number" ? "numeric" : undefined}
        min={f.min}
        max={f.type === "number" ? f.max : undefined}
        maxLength={f.type === "number" ? undefined : f.max}
        placeholder={f.placeholder}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) =>
          onChange(
            f.type === "number"
              ? e.target.value === ""
                ? undefined
                : Number(e.target.value)
              : e.target.value,
          )
        }
        className={`${FIELD} h-11`}
      />
    );
  }
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      {label}
      {input}
      {help}
    </div>
  );
}

/** The three email headers, drawn small with the hotel's colour and name. */
function HeaderChoice({
  value,
  onChange,
  accent,
  name,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  accent: string;
  name: string;
}) {
  const options = [
    {
      value: "logo",
      label: "Mi logotipo sobre blanco",
      top: (
        <>
          <div className="h-1.5" style={{ background: accent }} />
          <div className="grid h-14 place-items-center bg-white">
            <span className="rounded border border-dashed border-slate-300 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Tu logotipo
            </span>
          </div>
        </>
      ),
    },
    {
      value: "image",
      label: "Una foto de mi alojamiento",
      top: (
        <>
          <div className="h-14 bg-[linear-gradient(135deg,#8aa4b8,#d9c7a7_55%,#6b7f5e)]" />
          <div
            className="border-t-4 bg-white px-3 py-1.5 font-serif text-sm text-slate-900"
            style={{ borderColor: accent }}
          >
            {name}
          </div>
        </>
      ),
    },
    {
      value: "color",
      label: "Una banda con mi color y mi nombre",
      top: (
        <div
          className="flex h-[88px] items-center px-3 font-serif text-base text-white"
          style={{ background: accent }}
        >
          {name}
        </div>
      ),
    },
  ];
  return (
    <div className="mt-2 grid gap-3 sm:grid-cols-3" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`overflow-hidden rounded-xl border-2 text-left ${value === o.value ? "border-primary" : "border-border"}`}
        >
          <div className="bg-slate-100 p-2">
            <div className="overflow-hidden rounded-md bg-white shadow-sm">
              {o.top}
              <div className="space-y-1.5 p-3">
                <div className="h-1.5 w-16 rounded bg-emerald-200" />
                <div className="h-1.5 w-full rounded bg-slate-200" />
                <div className="h-1.5 w-4/5 rounded bg-slate-200" />
                <div className="mx-auto mt-2 h-4 w-20 rounded" style={{ background: accent }} />
              </div>
            </div>
          </div>
          <p className="flex items-center gap-2 px-3 py-2 text-xs font-semibold">
            {value === o.value && <Check className="size-3.5 text-primary" />}
            {o.label}
          </p>
        </button>
      ))}
    </div>
  );
}

/** Upload boxes for some kinds of file, with what is already uploaded. */
function FileBoxes({
  kinds,
  files,
  setFiles,
}: {
  kinds: FileKindDef[];
  files: FileRow[];
  setFiles: (f: FileRow[] | ((f: FileRow[]) => FileRow[])) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(kind: FileKind, list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE_BYTES) {
        setError(`«${file.name}» pasa de 20 MB. Comprímelo o divídelo.`);
        continue;
      }
      setBusy(file.name);
      try {
        const r = await call<{ id: string; path: string; token: string; content_type: string }>({
          action: "upload",
          kind,
          name: file.name,
          size: file.size,
        });
        const { error: upError } = await sales()
          .storage.from("onboarding")
          .uploadToSignedUrl(r.path, r.token, file, { contentType: r.content_type });
        if (upError) {
          await call({ action: "delete_file", id: r.id }).catch(() => {});
          throw new Error(`No se pudo subir «${file.name}».`);
        }
        setFiles((f) => [...f, { id: r.id, kind, name: file.name, size: file.size }]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(null);
      }
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await call({ action: "delete_file", id });
      setFiles((f) => f.filter((x) => x.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!kinds.length) return null;
  return (
    <>
      <div className="mt-6 space-y-4">
        {kinds.map((k) => {
          const mine = files.filter((f) => f.kind === k.kind);
          return (
            <div key={k.kind} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <FileSpreadsheet className="size-4 text-muted-foreground" />
                    {k.label}
                    {k.required && <span className="text-gold-foreground">*</span>}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{k.help}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                    {k.accept.join(" · ")}
                  </p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted">
                  <Upload className="size-4" /> Subir
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    accept={k.accept.map((a) => `.${a}`).join(",")}
                    disabled={!!busy}
                    onChange={(e) => {
                      void upload(k.kind, e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {mine.length > 0 && (
                <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                  {mine.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="text-xs text-muted-foreground">{kb(f.size)}</span>
                      <button
                        type="button"
                        onClick={() => void remove(f.id)}
                        aria-label={`Quitar ${f.name}`}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {busy && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Subiendo {busy}…
        </p>
      )}
      {error && <p className="mt-4 text-sm font-semibold text-red-700">{error}</p>}
    </>
  );
}

function SendStep({
  data,
  files,
  submitted,
  onNotes,
  onSubmitted,
  goTo,
}: {
  data: OnboardingData;
  files: FileRow[];
  submitted: boolean;
  onNotes: (v: string) => void;
  onSubmitted: () => void;
  goTo: (id: string) => void;
}) {
  const problems = useMemo(
    () =>
      onboardingProblems(
        data,
        files.map((f) => f.kind),
      ),
    [data, files],
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    try {
      await call({ action: "submit", data });
      onSubmitted();
    } catch (e) {
      const err = e as ApiError;
      setError(err.problems.length ? `${err.message}: ${err.problems.join("; ")}` : err.message);
    } finally {
      setSending(false);
    }
  }

  const sectionOf = (p: string) =>
    p.startsWith("Archivos")
      ? "files"
      : (SECTIONS.find((s) => p.startsWith(`${s.title}:`))?.id ?? "send");

  return (
    <>
      <h2 className="font-display text-2xl">Revisar y enviar</h2>
      {submitted && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">¡Recibido! Gracias.</p>
          <p className="mt-1">
            Revisamos tus datos y te escribimos para lo que falte. Si cambias algo, vuelve a pulsar
            «Enviar» y nos llegará actualizado.
          </p>
        </div>
      )}
      <div className="mt-5">
        <label htmlFor="notes" className="text-sm font-semibold">
          ¿Algo más que debamos saber?
        </label>
        <textarea
          id="notes"
          rows={4}
          value={(data.extra?.notes as string | undefined) ?? ""}
          onChange={(e) => onNotes(e.target.value)}
          className={`${FIELD} py-2`}
          placeholder="Horarios de recepción, habitaciones especiales, fechas de apertura…"
        />
      </div>
      {problems.length > 0 ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Antes de enviar, falta:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {problems.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => goTo(sectionOf(p))}
                  className="text-left underline decoration-amber-400 underline-offset-2"
                >
                  {p}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">
          Todo listo. Al enviar nos llega un aviso y empezamos a preparar tu alta.
        </p>
      )}
      {error && <p className="mt-4 text-sm font-semibold text-red-700">{error}</p>}
      <button
        type="button"
        disabled={problems.length > 0 || sending}
        onClick={() => void send()}
        className="mt-6 flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        {sending && <Loader2 className="size-4 animate-spin" />}
        {submitted ? "Enviar de nuevo" : "Enviar a Melend/OS"}
      </button>
    </>
  );
}

/** What the template web will look like with their colour, name and tagline. */
function WebPreview({ accent, name, tagline }: { accent: string; name: string; tagline: string }) {
  return (
    <div className="mt-6">
      <p className="text-sm font-semibold">Así se verá tu web</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Una idea con tu color y tu nombre; la montamos con tus fotos y textos.
      </p>
      <div className="mt-3 overflow-hidden rounded-xl border border-border bg-white text-slate-900 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 text-xs">
          <span className="font-serif text-sm font-semibold">{name}</span>
          <span className="flex gap-3 text-slate-500">
            <span>Inicio</span>
            <span>Habitaciones</span>
            <span
              className="rounded px-2 py-0.5 font-semibold text-white"
              style={{ background: accent }}
            >
              Mi reserva
            </span>
          </span>
        </div>
        <div
          className="relative flex h-40 flex-col justify-end p-5 text-white"
          style={{
            background: `linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.55)), linear-gradient(135deg, #8aa4b8, #d9c7a7 55%, #6b7f5e)`,
          }}
        >
          <p className="font-serif text-2xl font-semibold drop-shadow">{name}</p>
          {tagline && <p className="mt-1 text-sm opacity-90">{tagline}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 p-4">
          <span className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500">
            Entrada → Salida
          </span>
          <span className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500">
            2 personas
          </span>
          <span
            className="rounded-lg px-4 py-2 text-xs font-semibold text-white"
            style={{ background: accent }}
          >
            Ver habitaciones
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 px-4 pb-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="overflow-hidden rounded-lg border border-slate-200">
              <div className="h-12 bg-[linear-gradient(135deg,#cfd8df,#e9e1d3)]" />
              <div className="space-y-1 p-2">
                <div className="h-1.5 w-3/4 rounded bg-slate-200" />
                <div className="h-1.5 w-1/2 rounded" style={{ background: accent, opacity: 0.6 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
