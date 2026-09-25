import { useEffect, useRef, useState } from "react";
import { Bot, ConciergeBell, SendHorizonal } from "lucide-react";
import { toast } from "sonner";
import {
  CATEGORY_LABELS,
  QUICK_REQUESTS,
  useGuestChat,
  useSendGuestMessage,
  type ChatMessage,
} from "@/lib/chat";

const time = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function Bubble({ m }: { m: ChatMessage }) {
  const mine = m.sender === "guest";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] px-3 py-2 text-sm shadow-sm ${
          mine
            ? "bg-[var(--brand)] text-white"
            : "bg-white text-neutral-800 ring-1 ring-neutral-100"
        }`}
      >
        {!mine && (
          <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-neutral-500">
            {m.sender === "assistant" ? (
              <Bot className="h-3 w-3" />
            ) : (
              <ConciergeBell className="h-3 w-3" />
            )}
            {m.sender === "assistant" ? "Asistente" : "Recepción"}
          </p>
        )}
        {m.category && CATEGORY_LABELS[m.category] && (
          <span
            className={`mb-1 inline-block px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              mine ? "bg-white/20" : "bg-neutral-100 text-neutral-500"
            }`}
          >
            {CATEGORY_LABELS[m.category]}
          </span>
        )}
        <p className="whitespace-pre-wrap break-words">{m.body}</p>
        <p className={`mt-1 text-right text-[10px] ${mine ? "text-white/70" : "text-neutral-400"}`}>
          {time(m.created_at)}
          {mine && m.read_at ? " · leído" : ""}
        </p>
      </div>
    </div>
  );
}

/**
 * The guest's conversation with reception about one booking. `token` is the
 * booking token for guests without an account (null when signed in).
 */
export function StayChat({
  reservationId,
  token,
  open,
  initialRequest,
}: {
  reservationId: string;
  token: string | null;
  open: boolean;
  /** Pre-fills a quick request (e.g. from the "Late checkout" button). */
  initialRequest?: string;
}) {
  const { data: messages, isPending, error } = useGuestChat(reservationId, token);
  const send = useSendGuestMessage(reservationId, token);
  const preset = QUICK_REQUESTS.find((q) => q.category === initialRequest);
  const [text, setText] = useState<string>(preset?.text ?? "");
  const [category, setCategory] = useState<string | undefined>(preset?.category);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  const submit = (body: string, cat?: string) => {
    if (!body.trim()) return;
    send.mutate(
      { body: body.trim(), category: cat },
      {
        onSuccess: () => {
          setText("");
          setCategory(undefined);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  if (error) {
    return (
      <p className="py-10 text-center text-sm text-neutral-500">No encontramos esta reserva.</p>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="min-h-[55vh] space-y-2 px-4 py-4">
        {isPending && <p className="text-center text-sm text-neutral-400">Cargando…</p>}
        {messages && messages.length === 0 && (
          <div className="bg-white p-4 text-sm text-neutral-600 shadow-sm ring-1 ring-neutral-100">
            <p className="font-semibold text-neutral-800">Hola 👋</p>
            <p className="mt-1">
              Escríbenos lo que necesites o usa una petición rápida. Recepción te responde aquí
              mismo, las 24 horas.
            </p>
          </div>
        )}
        {messages?.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        <div ref={end} />
      </div>

      {open ? (
        <div className="sticky bottom-0 border-t border-neutral-200 bg-white/95 px-3 pb-3 pt-2 backdrop-blur">
          <div className="no-scrollbar -mx-3 mb-2 flex gap-1.5 overflow-x-auto px-3">
            {QUICK_REQUESTS.map((q) => (
              <button
                key={q.category}
                type="button"
                onClick={() => {
                  setCategory(q.category);
                  setText(q.text);
                }}
                className={`shrink-0 border px-2.5 py-1 text-xs font-medium ${
                  category === q.category
                    ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                    : "border-neutral-200 bg-white text-neutral-600"
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(text, category);
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(text, category);
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder="Escribe a recepción…"
              aria-label="Mensaje para recepción"
              className="max-h-32 min-h-[42px] flex-1 resize-none border border-neutral-200 px-3 py-2.5 text-sm"
            />
            <button
              type="submit"
              disabled={send.isPending || !text.trim()}
              aria-label="Enviar"
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center bg-[var(--brand)] text-white disabled:opacity-40"
            >
              <SendHorizonal className="h-4 w-4" />
            </button>
          </form>
        </div>
      ) : (
        <p className="border-t border-neutral-200 px-4 py-3 text-center text-xs text-neutral-500">
          La conversación de esta reserva está cerrada.
        </p>
      )}
    </div>
  );
}
