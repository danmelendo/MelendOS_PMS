import { useEffect, useRef, useState } from "react";
import { Database, RotateCcw, SendHorizonal, Sparkles, X } from "lucide-react";
import { COPILOT_TOOL_LABELS } from "@shared/copilot/tools.ts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Formatted } from "@/components/FormattedText";
import { useHotelsWith } from "@/lib/features";
import { t } from "@/lib/i18n";

interface Line {
  role: "user" | "assistant" | "error";
  text: string;
  tools?: string[];
}

const SUGGESTIONS = [
  "¿Qué habitación se reserva menos entre semana?",
  "¿Cómo va la ocupación de este mes frente al año pasado?",
  "Resume las peticiones de los huéspedes de este mes",
  "¿Qué tengo pendiente ahora mismo?",
  "¿Qué noches de la semana se venden peor?",
];

// The admin copilot as a floating assistant (bottom right) on every panel page:
// questions about the business answered with the hotel's data (admin-copilot
// function). Read-only. Mounted in the panel layout, so the conversation
// survives moving between pages. Only for hotels with the module.
export function CopilotWidget() {
  const { data: hotels } = useHotelsWith("copilot");
  const [open, setOpen] = useState(false);
  const [hotel, setHotel] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!hotel && hotels?.length) setHotel(hotels[0].id);
  }, [hotel, hotels]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines.length, busy, open]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  if (!hotels?.length) return null;

  const reset = () => {
    setLines([]);
    setConversationId(null);
  };

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy || !hotel) return;
    setText("");
    setLines((l) => [...l, { role: "user", text: q }]);
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-copilot", {
        body: { message: q, tenant_id: hotel, conversation_id: conversationId },
      });
      if (error || !data?.reply) {
        let message = "El copiloto no ha podido responder. Inténtalo de nuevo.";
        try {
          const body = await (error as { context?: Response })?.context?.json();
          if (body?.error) message = body.error;
        } catch {
          /* keep the generic message */
        }
        setLines((l) => [...l, { role: "error", text: message }]);
        return;
      }
      setConversationId(data.conversation_id);
      setLines((l) => [...l, { role: "assistant", text: data.reply, tools: data.tools }]);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.97] motion-reduce:transition-none"
      >
        <Sparkles className="h-4 w-4 text-gold" /> {t("Copiloto")}
      </button>
    );
  }

  return (
    <section
      aria-label={t("Copiloto de gestión")}
      className="copilot-panel fixed inset-x-2 bottom-2 z-40 flex max-h-[min(640px,calc(100dvh-4rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[400px]"
    >
      <header className="flex items-center gap-2 border-b bg-primary px-3 py-2.5 text-primary-foreground">
        <Sparkles className="h-4 w-4 shrink-0 text-gold" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{t("Copiloto")}</p>
          <p className="truncate text-[11px] opacity-75">{t("Datos del hotel · solo consulta")}</p>
        </div>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            className="rounded p-1.5 hover:bg-white/10"
            aria-label={t("Nueva conversación")}
            title={t("Nueva conversación")}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-1.5 hover:bg-white/10"
          aria-label={t("Cerrar el copiloto")}
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {hotels.length > 1 && (
        <div className="border-b px-3 py-2">
          <Select
            value={hotel ?? undefined}
            onValueChange={(v) => {
              setHotel(v);
              reset();
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {hotels.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="min-h-40 flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
        {lines.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {t("Pregunta por el negocio en lenguaje natural. Por ejemplo:")}
            </p>
            <div className="flex flex-col items-start gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  disabled={!hotel}
                  className="rounded-lg border bg-background px-2.5 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          lines.map((l, i) =>
            l.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                  {l.text}
                </div>
              </div>
            ) : (
              <div key={i} className="max-w-[95%] space-y-1">
                <div
                  className={`rounded-lg px-3 py-2 text-sm ${
                    l.role === "error"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-foreground"
                  }`}
                >
                  <Formatted text={l.text} />
                </div>
                {!!l.tools?.length && (
                  <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    <Database className="h-3 w-3" />
                    {l.tools.map((t) => (
                      <span key={t} className="rounded bg-info/10 px-1.5 py-0.5 text-info">
                        {COPILOT_TOOL_LABELS[t] ?? t}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            ),
          )
        )}
        {busy && <p className="text-sm text-muted-foreground">{t("Consultando los datos…")}</p>}
        <div ref={end} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
        className="flex items-end gap-2 border-t p-2"
      >
        <Textarea
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(text);
            }
            if (e.key === "Escape") setOpen(false);
          }}
          rows={1}
          maxLength={1000}
          placeholder={t("¿Qué quieres saber del negocio?")}
          className="min-h-9 resize-none text-sm"
          aria-label={t("Pregunta al copiloto")}
        />
        <Button type="submit" size="icon" disabled={busy || !text.trim() || !hotel}>
          <SendHorizonal className="h-4 w-4" />
          <span className="sr-only">{t("Enviar")}</span>
        </Button>
      </form>
    </section>
  );
}
