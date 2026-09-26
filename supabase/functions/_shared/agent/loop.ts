// The booking agent's turn: the model may call the domain tools a few times
// before answering. Tools run on the server with the tenant from the context
// (never from the model); their errors go back to the model as data so it can
// recover. Portable: any OpenAI-compatible model (see llm.ts).
import { runTool, toolSchemas, type ToolContext, type ToolStore } from "../tools/registry.ts";
import type { ChatMessage, LlmClient, ToolSpec } from "./llm.ts";

export const MAX_STEPS = 6;
const MAX_TOOL_RESULT_CHARS = 6000;

export type Outcome =
  | "answered"
  | "booking_draft"
  | "payment_link"
  | "handoff"
  | "refused"
  | "error";

/** Buttons the web shows under the answer (links come from tools, not the model). */
export interface Attachment {
  kind: "manage" | "payment";
  label: string;
  url: string;
}

export interface TurnResult {
  reply: string;
  /** Messages to store: the assistant's tool calls, tool results and answer. */
  messages: ChatMessage[];
  toolsCalled: string[];
  attachments: Attachment[];
  outcome: Outcome;
  inputTokens: number;
  outputTokens: number;
  reservationId: string | null;
}

let cachedSpecs: ToolSpec[] | null = null;
export function toolSpecs(): ToolSpec[] {
  cachedSpecs ??= toolSchemas().map((t) => {
    const { $schema: _drop, ...parameters } = t.input_schema as Record<string, unknown>;
    return {
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters },
    };
  });
  return cachedSpecs;
}

function parseArgs(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { __invalid_json: raw };
  }
}

const euros = (n: unknown) => `${Number(n).toFixed(2).replace(".", ",")} €`;

function attach(list: Attachment[], a: Attachment) {
  const i = list.findIndex((x) => x.kind === a.kind);
  if (i >= 0) list[i] = a;
  else list.push(a);
}

/**
 * Links with the guest's booking token are shown as buttons: they never go to
 * the model (it would copy or mangle them).
 */
function withoutLinks(data: Record<string, unknown>) {
  const { manage_url: _m, payment_url: _p, ...rest } = data;
  return rest;
}

/** 139.5 EUR → 139,50 € (small models ignore the formatting rule). */
function spanishPrices(text: string): string {
  return text.replace(
    /(\d+)(?:[.,](\d{1,2}))?\s?(?:€|EUR\b|euros?\b)/gi,
    (_all, int: string, dec?: string) => `${int},${(dec ?? "00").padEnd(2, "0")} €`,
  );
}

/**
 * No URL from the model reaches the guest: small models invent payment links.
 * The only links shown are the buttons built from what the tools really did.
 */
export function cleanReply(text: string): string {
  return spanishPrices(
    text
      // Internal plumbing the model sometimes echoes: tool-call tags, JSON
      // arguments, function names (search_availability, create_payment_link…).
      .replace(/<\/?tool_call>/g, "")
      .replace(/\{[^{}]*"[a-z_]+"\s*:[^{}]*\}/g, "")
      .replace(/`*\b[a-z]+(?:_[a-z]+)+\b(?:\([^)]*\))?`*/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\(\s*https?:\/\/[^)]*\)/g, "$1")
      .replace(/<?https?:\/\/[^\s)>]*[^\s)>.,;:!?]>?/g, "")
      // Pretend buttons ("[Pagar]"): the real ones are rendered by the web.
      .replace(/^[ \t]*(\[[^\]\n]+\][ \t]*)+$/gm, "")
      .replace(/\[([^\]\n]+)\]/g, "$1")
      .replace(/[ \t]+([.,;:!?])/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

const FALLBACK_NOT_DONE =
  "Todavía no he podido completar la gestión. ¿Me confirmas la habitación, las fechas, tu nombre, tu email y cómo prefieres pagar?";

/**
 * A reply that claims a booking or a cancellation request that did not happen
 * in this turn. Returns the correction note for the model, or null.
 */
export function falseClaim(reply: string, done: (tool: string) => boolean): string | null {
  const text = reply.toLowerCase();
  const booked =
    /\b(he|hemos) (reservado|hecho la reserva|creado (la|tu) reserva|registrado (la|tu) reserva)|\breserva (creada|hecha|realizada|registrada)\b|\bya (está|tienes) (reservad|tu reserva)/.test(
      text,
    );
  if (booked && !done("create_booking_draft")) {
    return "Nota del sistema (el cliente no la ve): la reserva NO existe porque no has llamado a create_booking_draft. Llámala ahora con los datos que te ha dado el cliente, o pídele lo que falte. No digas que está reservada.";
  }
  const cancelled =
    /\b(he|hemos) (solicitado|pedido|enviado|tramitado) (la )?cancelaci|\bsolicitud de cancelación (enviada|registrada|creada)/.test(
      text,
    );
  if (cancelled && !done("request_cancellation")) {
    return "Nota del sistema (el cliente no la ve): la cancelación NO se ha solicitado porque no has llamado a request_cancellation. Llámala ahora con la referencia y el email del cliente, o pídele lo que falte.";
  }
  return null;
}

export const OFF_TOPIC_REPLY =
  "Solo puedo ayudarte con tu estancia en el hotel: habitaciones, precios, reservas y cancelaciones. ¿Buscas alguna fecha?";

/**
 * The agent only talks about the hotel. The prompt says so; this catches the
 * obvious misses (it wrote code, or it was asked to act as something else).
 */
export function looksOffTopic(reply: string): boolean {
  return (
    /```/.test(reply) ||
    /\bdef \w+\s*\(|\breturn\b|\blambda\b|\bsorted\(|\bprint\(|\bconsole\.log\(|=>\s*\{/.test(
      reply,
    ) ||
    /^\s*(def |class |import |from \S+ import|function |const |let |print\(|console\.log|#include|SELECT |<\?php)/im.test(
      reply,
    )
  );
}

const EMAIL_TOOLS = new Set(["create_booking_draft", "get_booking", "request_cancellation"]);

/**
 * Guests' personal data must come from the guest, not from the model: a small
 * model asked to "book the cheapest room" may invent a name and an email. The
 * email given to these tools has to appear in something the guest wrote.
 */
export function guestDataGuard(
  name: string,
  args: unknown,
  userTexts: string[],
): { ok: false; error: { code: string; message: string } } | null {
  if (!EMAIL_TOOLS.has(name)) return null;
  const a = (args ?? {}) as { email?: unknown; customer?: { email?: unknown } };
  const email = String(a.customer?.email ?? a.email ?? "")
    .trim()
    .toLowerCase();
  if (!email) return null; // the tool's own validation answers
  const said = userTexts.some((t) => t.toLowerCase().includes(email));
  return said
    ? null
    : {
        ok: false,
        error: {
          code: "missing_guest_data",
          message: "El cliente no ha dado ese email. Pídele su nombre y su email; no los inventes.",
        },
      };
}

const FALLBACK =
  "Ahora mismo no puedo completar la consulta. Puedes reservar en la web o escribir a recepción.";

export async function runAgentTurn(opts: {
  llm: LlmClient;
  store: ToolStore;
  ctx: ToolContext;
  system: string;
  /** Earlier messages of the conversation (without the system prompt). */
  history: ChatMessage[];
  userMessage: string;
}): Promise<TurnResult> {
  const { llm, store, ctx } = opts;
  const turn: ChatMessage[] = [{ role: "user", content: opts.userMessage }];
  const result: TurnResult = {
    reply: FALLBACK,
    messages: [],
    toolsCalled: [],
    attachments: [],
    outcome: "answered",
    inputTokens: 0,
    outputTokens: 0,
    reservationId: null,
  };

  // Correction notes for the model within this turn (never stored or shown).
  let nudge: ChatMessage[] = [];
  let nudged = false;
  const failed = new Set<string>();
  const done = (tool: string) => result.toolsCalled.includes(tool) && !failed.has(tool);

  for (let step = 0; step < MAX_STEPS; step++) {
    const messages: ChatMessage[] = [
      { role: "system", content: opts.system },
      ...opts.history,
      ...turn,
      ...nudge,
    ];
    let res;
    try {
      res = await llm.complete(messages, toolSpecs());
    } catch (e) {
      // Small models now and then emit a broken tool call (the provider answers
      // 5xx): one retry usually gets a clean one.
      if (!/LLM 5\d\d/.test((e as Error).message)) throw e;
      res = await llm.complete(messages, toolSpecs());
    }
    result.inputTokens += res.inputTokens;
    result.outputTokens += res.outputTokens;

    if (!res.toolCalls.length) {
      // A small model may say it booked or asked to cancel without doing it.
      // Once per turn, tell it and let it act (or ask for what is missing).
      const claim = falseClaim(res.content ?? "", done);
      if (claim && !nudged) {
        nudged = true;
        nudge = [
          { role: "assistant", content: res.content ?? "" },
          { role: "user", content: claim },
        ];
        continue;
      }
      if (claim) res.content = FALLBACK_NOT_DONE;
      if (looksOffTopic(res.content ?? "")) {
        result.reply = OFF_TOPIC_REPLY;
        result.outcome = "refused";
      } else {
        result.reply = cleanReply(res.content ?? "") || FALLBACK;
      }
      turn.push({ role: "assistant", content: result.reply });
      break;
    }

    nudge = [];
    turn.push({ role: "assistant", content: res.content ?? null, tool_calls: res.toolCalls });
    for (const call of res.toolCalls) {
      const name = call.function.name;
      result.toolsCalled.push(name);
      const args = parseArgs(call.function.arguments);
      const refused = guestDataGuard(name, args, [
        ...opts.history.filter((m) => m.role === "user").map((m) => String(m.content)),
        opts.userMessage,
      ]);
      const out = refused ?? (await runTool(name, args, store, ctx));
      if (!out.ok) failed.add(name);
      else failed.delete(name);
      let shown: unknown = out;
      if (out.ok) {
        const data = out.data as Record<string, unknown>;
        shown = { ok: true, data: withoutLinks(data) };
        if (name === "create_booking_draft" && typeof data.manage_url === "string") {
          result.outcome = "booking_draft";
          result.reservationId = String(data.reservation_id);
          attach(result.attachments, {
            kind: "manage",
            label: "Ver mi reserva",
            url: data.manage_url,
          });
          // Paid online: the checkout page takes the whole stay with the same
          // token. Paid at the hotel: already confirmed, nothing to pay now.
          if (data.payment_mode === "prepay" && Number(data.to_pay_online_now) > 0) {
            attach(result.attachments, {
              kind: "payment",
              label: `Pagar la reserva (${euros(data.to_pay_online_now)})`,
              url: data.manage_url.replace("/web/booking/", "/web/checkout/"),
            });
          }
        } else if (name === "create_payment_link" && typeof data.payment_url === "string") {
          result.outcome = "payment_link";
          attach(result.attachments, {
            kind: "payment",
            label: `Pagar la reserva (${euros(data.amount)})`,
            url: data.payment_url,
          });
        } else if (name === "request_cancellation" && result.outcome === "answered") {
          result.outcome = "handoff";
        }
      }
      turn.push({
        role: "tool",
        tool_call_id: call.id,
        name,
        content: JSON.stringify(shown).slice(0, MAX_TOOL_RESULT_CHARS),
      });
    }
    if (step === MAX_STEPS - 1) {
      // Out of steps: answer with what we have rather than loop forever.
      result.reply =
        "He necesitado demasiados pasos para esta consulta. ¿Me la puedes concretar un poco más?";
      turn.push({ role: "assistant", content: result.reply });
    }
  }

  result.messages = turn.slice(1); // the user message is stored by the caller
  return result;
}
