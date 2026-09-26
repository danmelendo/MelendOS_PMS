// POST /agent-chat  { message, conversation_id?, tenant_slug? }
//
// The booking agent of the public web. The browser only keeps the
// conversation id: history and tool results live on the server. The model is
// any OpenAI-compatible endpoint set by LLM_BASE_URL / LLM_API_KEY / LLM_MODEL
// (local Ollama in development, a hosted provider in production). The tools
// run here with the service role, scoped to the conversation's hotel.
import { adminClient, corsHeaders, json } from "../_shared/http.ts";
import { openAiCompatible, type ChatMessage } from "../_shared/agent/llm.ts";
import { runAgentTurn } from "../_shared/agent/loop.ts";
import { agentSystemPrompt } from "../_shared/agent/context.ts";
import { supabaseToolStore } from "../_shared/tools/supabase-store.ts";

const MAX_MESSAGE_CHARS = 1000;
const MAX_TURNS = 40;
const HISTORY = 24;

type Row = Record<string, unknown>;

function toChat(m: Row): ChatMessage {
  if (m.role === "tool") {
    return {
      role: "tool",
      content: String(m.content ?? ""),
      tool_call_id: String(m.tool_call_id),
      name: (m.tool_name as string) ?? undefined,
    };
  }
  if (m.role === "assistant") {
    return {
      role: "assistant",
      content: (m.content as string) ?? null,
      ...(m.tool_calls ? { tool_calls: m.tool_calls as never } : {}),
    };
  }
  return { role: "user", content: String(m.content ?? "") };
}

const NOT_CONTRACTED = "El asistente no está disponible en este hotel.";

/** The AI package includes the booking agent (see @domain/features.ts). */
async function agentEnabled(db: ReturnType<typeof adminClient>, tenantId: string) {
  const { data } = await db.rpc("tenant_feature", { p_tenant: tenantId, p_feature: "ai_agent" });
  return data === true;
}

function webUrl(req: Request) {
  const origin = req.headers.get("Origin");
  if (origin && /^https?:\/\/[^/]+$/.test(origin)) return origin;
  return Deno.env.get("PUBLIC_WEB_URL") ?? "https://demostays.example";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const baseUrl = Deno.env.get("LLM_BASE_URL");
  const model = Deno.env.get("LLM_MODEL");
  if (!baseUrl || !model) {
    return json({ error: "El asistente no está disponible ahora mismo." }, 503);
  }

  let body: { message?: string; conversation_id?: string; tenant_slug?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const message = String(body.message ?? "").trim();
  if (!message) return json({ error: "Escribe un mensaje" }, 400);
  if (message.length > MAX_MESSAGE_CHARS) {
    return json({ error: `Máximo ${MAX_MESSAGE_CHARS} caracteres por mensaje` }, 400);
  }

  const db = adminClient();

  // Conversation: the existing one (its hotel is fixed), or a new one for the
  // hotel of the website the visitor is on.
  let conversation: Row | null = null;
  if (body.conversation_id && /^[0-9a-f-]{36}$/i.test(body.conversation_id)) {
    const { data } = await db
      .from("agent_conversations")
      .select("id, tenant_id, turns")
      .eq("id", body.conversation_id)
      .eq("channel", "web_chat")
      .maybeSingle();
    conversation = data;
  }
  if (!conversation) {
    const { data: t } = await db
      .from("tenants")
      .select("id")
      .eq("slug", body.tenant_slug ?? "")
      .in("status", ["trial", "active"])
      .maybeSingle();
    if (!t) return json({ error: "Hotel no encontrado" }, 404);
    if (!(await agentEnabled(db, t.id))) return json({ error: NOT_CONTRACTED }, 403);
    const { data, error } = await db
      .from("agent_conversations")
      .insert({ tenant_id: t.id, channel: "web_chat" })
      .select("id, tenant_id, turns")
      .single();
    if (error) return json({ error: "No se pudo abrir la conversación" }, 500);
    conversation = data;
  }
  if (Number(conversation.turns) >= MAX_TURNS) {
    return json({ error: "Esta conversación es muy larga; empieza una nueva." }, 429);
  }
  const tenantId = String(conversation.tenant_id);
  // The hotel may have dropped the module since the conversation started.
  if (!(await agentEnabled(db, tenantId))) return json({ error: NOT_CONTRACTED }, 403);
  const conversationId = String(conversation.id);

  const now = new Date();
  const [system, { data: past }] = await Promise.all([
    agentSystemPrompt(db, tenantId, now, Deno.env.get("LLM_PROMPT_SUFFIX") ?? undefined),
    db
      .from("agent_messages")
      .select("role, content, tool_calls, tool_call_id, tool_name")
      .eq("conversation_id", conversationId)
      .order("id", { ascending: false })
      .limit(HISTORY),
  ]);

  // The history must not start with tool results cut off by the limit.
  const history = (past ?? []).reverse().map(toChat);
  while (history.length && history[0].role !== "user") history.shift();

  const llm = openAiCompatible({ baseUrl, apiKey: Deno.env.get("LLM_API_KEY"), model });
  const started = Date.now();
  try {
    const turn = await runAgentTurn({
      llm,
      store: supabaseToolStore(db),
      ctx: { tenantId, userId: null, channel: "web_chat", webUrl: webUrl(req), now },
      system,
      history,
      userMessage: message,
    });

    const rows = [{ role: "user", content: message } as ChatMessage, ...turn.messages].map((m) => ({
      conversation_id: conversationId,
      tenant_id: tenantId,
      role: m.role,
      content: m.content,
      tool_calls: m.role === "assistant" && m.tool_calls ? m.tool_calls : null,
      tool_call_id: m.role === "tool" ? m.tool_call_id : null,
      tool_name: m.role === "tool" ? (m.name ?? null) : null,
    }));
    await db.from("agent_messages").insert(rows);
    await db
      .from("agent_conversations")
      .update({
        turns: Number(conversation.turns) + 1,
        last_message_at: new Date().toISOString(),
        ...(turn.reservationId ? { reservation_id: turn.reservationId } : {}),
      })
      .eq("id", conversationId);
    await db.from("agent_runs").insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      channel: "web_chat",
      model,
      input_tokens: turn.inputTokens,
      output_tokens: turn.outputTokens,
      latency_ms: Date.now() - started,
      tools_called: turn.toolsCalled,
      outcome: turn.outcome,
    });

    return json({
      conversation_id: conversationId,
      reply: turn.reply,
      attachments: turn.attachments,
    });
  } catch (e) {
    const error = (e as Error).message;
    console.error(`agent-chat failed: ${error}`);
    await db.from("agent_runs").insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      channel: "web_chat",
      model,
      latency_ms: Date.now() - started,
      outcome: "error",
      error: error.slice(0, 500),
    });
    return json(
      {
        conversation_id: conversationId,
        error: "El asistente no ha podido responder. Inténtalo de nuevo en un momento.",
      },
      502,
    );
  }
});
