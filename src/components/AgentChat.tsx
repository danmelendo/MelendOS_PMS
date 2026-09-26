import { useEffect, useRef, useState } from "react";
import { Bot, CreditCard, ExternalLink, MessageCircle, SendHorizonal, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand";
import { useBrandTenant, useFeatures } from "@/lib/features";
import { Formatted } from "@/components/FormattedText";

// The booking agent on the public website. The server keeps the conversation
// (agent-chat function); the browser only remembers its id for the session.
// Links (booking, payment) arrive as buttons built from what the tools did.

interface Attachment {
  kind: "manage" | "payment";
  label: string;
  url: string;
}
interface Line {
  role: "user" | "assistant";
  text: string;
  attachments?: Attachment[];
}

const GREETING =
  "¡Hola! Soy el asistente de reservas. Dime fechas y cuántas personas sois y te digo qué habitaciones hay libres y a qué precio.";

export function AgentChat() {
  const { brandId } = useBrand();
  const { data: tenant } = useBrandTenant();
  const features = useFeatures();
  const storageKey = `agent-chat-${brandId}`;
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  // One conversation per brand and browser session.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      setConversationId(saved?.id ?? null);
      setLines(saved?.lines ?? []);
    } catch {
      setConversationId(null);
      setLines([]);
    }
  }, [storageKey]);
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ id: conversationId, lines }));
    } catch {
      /* storage unavailable: the chat still works for this page */
    }
  }, [storageKey, conversationId, lines]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines.length, busy, open]);

  // Part of the AI package: hotels without it do not show it.
  if (!features.ai_agent) return null;

  const send = async () => {
    const message = text.trim();
    if (!message || busy) return;
    setText("");
    setLines((l) => [...l, { role: "user", text: message }]);
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("agent-chat", {
        body: {
          message,
          conversation_id: conversationId,
          tenant_slug: tenant?.slug,
        },
      });
      let body = data as {
        conversation_id?: string;
        reply?: string;
        attachments?: Attachment[];
        error?: string;
      };
      if (error) {
        const ctx = (error as { context?: Response }).context;
        body =
          (ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null) ?? {};
      }
      if (body?.conversation_id) setConversationId(body.conversation_id);
      setLines((l) => [
        ...l,
        {
          role: "assistant",
          text:
            body?.reply ??
            body?.error ??
            "No he podido responder ahora mismo. Inténtalo de nuevo en un momento.",
          attachments: body?.attachments ?? [],
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-110"
        >
          <MessageCircle className="h-5 w-5" /> ¿Te ayudo a reservar?
        </button>
      )}
      {open && (
        <div
          role="dialog"
          aria-label="Asistente de reservas"
          className="fixed inset-0 z-50 flex flex-col bg-[#f4f6f9] shadow-2xl sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[600px] sm:max-h-[calc(100svh-2.5rem)] sm:w-[400px] sm:ring-1 sm:ring-neutral-200"
        >
          <div className="flex items-center justify-between bg-[var(--brand)] px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <div>
                <p className="text-sm font-semibold">Asistente de reservas</p>
                <p className="text-[11px] opacity-80">Precios y disponibilidad en tiempo real</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            <div className="max-w-[88%] bg-white px-3 py-2 shadow-sm ring-1 ring-neutral-100">
              {GREETING}
            </div>
            {lines.map((l, i) =>
              l.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap bg-[var(--brand)] px-3 py-2 text-white">
                    {l.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="max-w-[88%] space-y-2">
                  <div className="bg-white px-3 py-2 text-neutral-800 shadow-sm ring-1 ring-neutral-100">
                    <Formatted text={l.text} />
                  </div>
                  {l.attachments?.map((a) => (
                    <a
                      key={a.url}
                      href={a.url}
                      className={`flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold ${
                        a.kind === "payment"
                          ? "bg-[var(--brand)] text-white"
                          : "border border-[var(--brand)] bg-white text-[var(--brand)]"
                      }`}
                    >
                      {a.kind === "payment" ? (
                        <CreditCard className="h-4 w-4" />
                      ) : (
                        <ExternalLink className="h-4 w-4" />
                      )}
                      {a.label}
                    </a>
                  ))}
                </div>
              ),
            )}
            {busy && (
              <div className="flex w-fit items-center gap-1.5 bg-white px-3 py-2.5 shadow-sm ring-1 ring-neutral-100">
                <span className="sr-only">Escribiendo…</span>
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400"
                    style={{ animationDelay: `${d * 150}ms` }}
                  />
                ))}
              </div>
            )}
            <div ref={end} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-end gap-2 border-t border-neutral-200 bg-white p-3"
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              maxLength={1000}
              placeholder="Ej. 2 personas del 20 al 23 de noviembre"
              aria-label="Mensaje para el asistente"
              className="max-h-28 min-h-[42px] flex-1 resize-none border border-neutral-200 px-3 py-2.5 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !text.trim()}
              aria-label="Enviar"
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center bg-[var(--brand)] text-white disabled:opacity-40"
            >
              <SendHorizonal className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
