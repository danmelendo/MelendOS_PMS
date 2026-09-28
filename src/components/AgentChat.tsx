import { useEffect, useRef, useState } from "react";
import {
  Bot,
  CreditCard,
  ExternalLink,
  MessageCircle,
  Minus,
  Plus,
  SendHorizonal,
  Users,
  X,
} from "lucide-react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { eur } from "@/lib/stays";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand";
import { useBrandTenant, useFeatures } from "@/lib/features";
import { Formatted } from "@/components/FormattedText";

// The booking agent on the public website. The server keeps the conversation
// (agent-chat function); the browser only remembers its id for the session.
// Links (booking, payment), room cards and extras arrive as attachments built
// from what the tools did; their buttons just send the guest's next message.

interface RoomCard {
  room_id: string;
  room: string;
  hotel: string;
  type: string | null;
  capacity: number;
  price_total: number;
  price_per_night: number;
  image_url: string | null;
}
type Attachment =
  | { kind: "manage" | "payment"; label: string; url: string }
  | {
      kind: "rooms";
      search: { check_in: string; check_out: string; guests: number };
      rooms: RoomCard[];
    }
  | { kind: "extras"; extras: { extra_id: string; name: string; price: number }[] };

const nightsOf = (a: string, b: string) =>
  Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / -86_400_000);
const people = (n: number) => n + (n === 1 ? " persona" : " personas");

function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-7 w-7 items-center justify-center border border-neutral-200 bg-white disabled:opacity-40"
        aria-label={"Menos " + label}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-6 text-center text-sm tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-7 w-7 items-center justify-center border border-neutral-200 bg-white disabled:opacity-40"
        aria-label={"Más " + label}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Rooms found, as cards, with the search the guest can adjust. */
function RoomCards({
  att,
  tenantId,
  onSend,
  disabled,
}: {
  att: Extract<Attachment, { kind: "rooms" }>;
  tenantId?: string;
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const [dates, setDates] = useState({
    checkIn: att.search.check_in,
    checkOut: att.search.check_out,
  });
  const [guests, setGuests] = useState(att.search.guests);
  const changed =
    dates.checkIn !== att.search.check_in ||
    dates.checkOut !== att.search.check_out ||
    guests !== att.search.guests;
  const nights = nightsOf(att.search.check_in, att.search.check_out);
  return (
    <div className="space-y-2">
      <div className="space-y-2 bg-white p-2 ring-1 ring-neutral-100">
        <DateRangePicker
          checkIn={dates.checkIn}
          checkOut={dates.checkOut}
          onChange={setDates}
          pricing={tenantId ? { tenantId, guests } : undefined}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs text-neutral-600">
            <Users className="h-3.5 w-3.5" /> Personas
          </span>
          <Stepper value={guests} min={1} max={8} onChange={setGuests} label="personas" />
          <button
            type="button"
            disabled={!changed || disabled}
            onClick={() =>
              onSend(
                "Busca disponibilidad del " +
                  dates.checkIn +
                  " al " +
                  dates.checkOut +
                  " para " +
                  people(guests) +
                  ".",
              )
            }
            className="bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            Buscar
          </button>
        </div>
      </div>
      {att.rooms.length ? (
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
          {att.rooms.map((r) => (
            <div
              key={r.room_id}
              className="w-44 shrink-0 snap-start bg-white shadow-sm ring-1 ring-neutral-100"
            >
              {r.image_url ? (
                <img src={r.image_url} alt="" className="h-24 w-full object-cover" loading="lazy" />
              ) : (
                <div className="h-24 bg-neutral-100" />
              )}
              <div className="space-y-1 p-2">
                <p className="truncate text-sm font-semibold">
                  {r.type ?? "Habitación"} · {r.room}
                </p>
                <p className="text-[11px] text-neutral-500">
                  Hasta {r.capacity} personas · {nights} {nights === 1 ? "noche" : "noches"}
                </p>
                <p className="text-sm font-semibold text-[var(--brand)]">
                  {eur(r.price_total)}{" "}
                  <span className="text-[11px] font-normal text-neutral-500">
                    ({eur(r.price_per_night)}/noche)
                  </span>
                </p>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onSend(
                      "Elijo la habitación " +
                        r.room +
                        (r.type ? " (" + r.type + ")" : "") +
                        " del " +
                        att.search.check_in +
                        " al " +
                        att.search.check_out +
                        " para " +
                        people(att.search.guests) +
                        ".",
                    )
                  }
                  className="w-full bg-[var(--brand)] py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Elegir
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Extras the guest can add, with quantities. */
function ExtrasPicker({
  att,
  onSend,
  disabled,
}: {
  att: Extract<Attachment, { kind: "extras" }>;
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const picked = att.extras.filter((e) => (qty[e.extra_id] ?? 0) > 0);
  return (
    <div className="space-y-2 bg-white p-2 ring-1 ring-neutral-100">
      {att.extras.map((e) => (
        <div key={e.extra_id} className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm">{e.name}</p>
            <p className="text-[11px] text-neutral-500">{eur(e.price)}</p>
          </div>
          <Stepper
            value={qty[e.extra_id] ?? 0}
            min={0}
            max={20}
            onChange={(v) => setQty((q) => ({ ...q, [e.extra_id]: v }))}
            label={e.name}
          />
        </div>
      ))}
      <button
        type="button"
        disabled={!picked.length || disabled}
        onClick={() =>
          onSend(
            "Quiero añadir estos extras: " +
              picked.map((e) => e.name + " ×" + qty[e.extra_id]).join(", ") +
              ".",
          )
        }
        className="w-full bg-[var(--brand)] py-1.5 text-xs font-semibold text-white disabled:opacity-40"
      >
        Añadir a mi reserva
      </button>
    </div>
  );
}
interface Line {
  role: "user" | "assistant";
  text: string;
  attachments?: Attachment[];
}

const GREETING =
  "¡Hola! Soy el asistente de reservas. Dime fechas y cuántas personas sois y te digo qué habitaciones hay libres y a qué precio.";

/**
 * The booking assistant. On the hotel's web it is a floating button that opens
 * a panel; `embedded` is the version inside the widget's iframe on the hotel's
 * own website (/embed/assistant): always open, filling the frame, closing
 * through the host page and opening booking and payment links outside it.
 */
export function AgentChat({ embedded = false }: { embedded?: boolean } = {}) {
  const { brandId } = useBrand();
  const { data: tenant } = useBrandTenant();
  const features = useFeatures();
  const storageKey = `agent-chat-${brandId}`;
  const [open, setOpen] = useState(embedded);
  const close = () =>
    embedded ? window.parent.postMessage({ type: "melendos:close" }, "*") : setOpen(false);
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

  const send = async (typed?: string) => {
    const message = (typed ?? text).trim();
    if (!message || busy) return;
    if (typed === undefined) setText("");
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
          className={
            embedded
              ? "fixed inset-0 z-50 flex flex-col bg-[#f4f6f9]"
              : "fixed inset-0 z-50 flex flex-col bg-[#f4f6f9] shadow-2xl sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[600px] sm:max-h-[calc(100svh-2.5rem)] sm:w-[400px] sm:ring-1 sm:ring-neutral-200"
          }
        >
          <div className="flex items-center justify-between bg-[var(--brand)] px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <div>
                <p className="text-sm font-semibold">Asistente de reservas</p>
                <p className="text-[11px] opacity-80">Precios y disponibilidad en tiempo real</p>
              </div>
            </div>
            <button type="button" onClick={close} aria-label="Cerrar">
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
                <div key={i} className="max-w-[92%] space-y-2">
                  <div className="bg-white px-3 py-2 text-neutral-800 shadow-sm ring-1 ring-neutral-100">
                    <Formatted text={l.text} />
                  </div>
                  {l.attachments?.map((a) =>
                    a.kind === "rooms" ? (
                      <RoomCards
                        key="rooms"
                        att={a}
                        tenantId={tenant?.id}
                        onSend={send}
                        disabled={busy}
                      />
                    ) : a.kind === "extras" ? (
                      <ExtrasPicker key="extras" att={a} onSend={send} disabled={busy} />
                    ) : (
                      <a
                        key={a.url}
                        href={a.url}
                        // Payments and the booking page leave the widget's frame.
                        target={embedded ? "_top" : undefined}
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
                    ),
                  )}
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
              void send();
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
