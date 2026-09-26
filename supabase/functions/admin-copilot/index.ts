// POST /admin-copilot  { message, tenant_id, conversation_id? }
// Authorization: Bearer <staff member's JWT>
//
// The admin copilot of the panel: questions about the business answered with
// read-only tools (_shared/copilot/tools.ts). The tools read with the staff
// member's own session, so row level security applies on top of the hotel the
// server fixes. Same model settings and loop as the booking agent.
import { createClient } from "npm:@supabase/supabase-js@2";
import { adminClient, corsHeaders, json } from "../_shared/http.ts";
import { openAiCompatible, type ChatMessage } from "../_shared/agent/llm.ts";
import { runAgentTurn } from "../_shared/agent/loop.ts";
import { ymdInZone } from "../_shared/domain/dates.ts";
import { copilotPrompt } from "../_shared/copilot/prompt.ts";
import { supabaseCopilotStore } from "../_shared/copilot/supabase-store.ts";
import { copilotToolSpecs, runCopilotTool } from "../_shared/copilot/tools.ts";

const MAX_MESSAGE_CHARS = 1000;
const MAX_TURNS = 60;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const baseUrl = Deno.env.get("LLM_BASE_URL");
  const model = Deno.env.get("LLM_MODEL");
  if (!baseUrl || !model)
    return json({ error: "El copiloto no está disponible ahora mismo." }, 503);

  let body: { message?: string; tenant_id?: string; conversation_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const message = String(body.message ?? "").trim();
  if (!message) return json({ error: "Escribe una pregunta" }, 400);
  if (message.length > MAX_MESSAGE_CHARS) {
    return json({ error: `Máximo ${MAX_MESSAGE_CHARS} caracteres` }, 400);
  }
  const tenantId = String(body.tenant_id ?? "");

  // Who asks: a member of the hotel's staff, with their own session.
  const db = adminClient();
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: auth } = jwt.split(".").length === 3 ? await db.auth.getUser(jwt) : { data: null };
  const userId = auth?.user?.id;
  if (!userId) return json({ error: "Inicia sesión" }, 401);
  const { data: member } = await db
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return json({ error: "No perteneces a este hotel" }, 403);
  const { data: enabled } = await db.rpc("tenant_feature", {
    p_tenant: tenantId,
    p_feature: "copilot",
  });
  if (enabled !== true) {
    return json({ error: "El copiloto no está incluido en el plan de este hotel." }, 403);
  }

  // The staff member's own conversation in this hotel, or a new one.
  let conversation: Row | null = null;
  if (body.conversation_id && /^[0-9a-f-]{36}$/i.test(body.conversation_id)) {
    const { data } = await db
      .from("agent_conversations")
      .select("id, turns")
      .eq("id", body.conversation_id)
      .eq("channel", "admin_copilot")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .maybeSingle();
    conversation = data;
  }
  if (!conversation) {
    const { data, error } = await db
      .from("agent_conversations")
      .insert({ tenant_id: tenantId, channel: "admin_copilot", user_id: userId })
      .select("id, turns")
      .single();
    if (error) return json({ error: "No se pudo abrir la conversación" }, 500);
    conversation = data;
  }
  if (Number(conversation.turns) >= MAX_TURNS) {
    return json({ error: "Esta conversación es muy larga; empieza una nueva." }, 429);
  }
  const conversationId = String(conversation.id);

  const now = new Date();
  const [{ data: tenant }, { data: past }] = await Promise.all([
    db.from("tenants").select("name, settings").eq("id", tenantId).single(),
    db
      .from("agent_messages")
      .select("role, content, tool_calls, tool_call_id, tool_name")
      .eq("conversation_id", conversationId)
      .order("id", { ascending: false })
      .limit(HISTORY),
  ]);
  const tz = String((tenant?.settings as Row | null)?.timezone ?? "Europe/Madrid");
  const today = ymdInZone(now, tz);
  const system = copilotPrompt({
    hotel: String(tenant?.name ?? "el hotel"),
    today,
    weekday: new Intl.DateTimeFormat("es-ES", { weekday: "long", timeZone: tz }).format(now),
  });
  const history = (past ?? []).reverse().map(toChat);
  while (history.length && history[0].role !== "user") history.shift();

  // Reads with the staff member's session: RLS applies to every query.
  const userDb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const store = supabaseCopilotStore(userDb);
  const ctx = { tenantId, today, timezone: tz };

  const llm = openAiCompatible({ baseUrl, apiKey: Deno.env.get("LLM_API_KEY"), model });
  const started = Date.now();
  try {
    const turn = await runAgentTurn({
      llm,
      tools: {
        specs: copilotToolSpecs(),
        run: (name, args) => runCopilotTool(name, args, store, ctx),
      },
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
      .update({ turns: Number(conversation.turns) + 1, last_message_at: new Date().toISOString() })
      .eq("id", conversationId);
    await db.from("agent_runs").insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      channel: "admin_copilot",
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
      tools: [...new Set(turn.toolsCalled)],
    });
  } catch (e) {
    const error = (e as Error).message;
    console.error(`admin-copilot failed: ${error}`);
    await db.from("agent_runs").insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      channel: "admin_copilot",
      model,
      latency_ms: Date.now() - started,
      outcome: "error",
      error: error.slice(0, 500),
    });
    return json(
      {
        conversation_id: conversationId,
        error: "El copiloto no ha podido responder. Inténtalo de nuevo.",
      },
      502,
    );
  }
});
