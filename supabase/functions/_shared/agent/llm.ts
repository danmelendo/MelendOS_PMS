// Chat model client for any OpenAI-compatible endpoint: Ollama (local),
// OpenAI, Gemini, Groq, OpenRouter, DeepSeek, Mistral… Which one is only
// configuration (base URL, key, model), never code.

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string; name?: string };

export interface ToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface LlmResponse {
  content: string | null;
  toolCalls: ToolCall[];
  inputTokens: number;
  outputTokens: number;
}

export interface LlmClient {
  model: string;
  complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<LlmResponse>;
}

export interface LlmConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
}

/** Removes the reasoning some models (Qwen3, DeepSeek R1) print before answering. */
export function stripThinking(text: string | null): string | null {
  if (text == null) return null;
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

export function openAiCompatible(cfg: LlmConfig): LlmClient {
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;
  return {
    model: cfg.model,
    async complete(messages, tools) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 90_000);
      try {
        const res = await fetch(url, {
          method: "POST",
          signal: ctrl.signal,
          headers: {
            "Content-Type": "application/json",
            ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: cfg.model,
            messages,
            tools: tools.length ? tools : undefined,
            temperature: cfg.temperature ?? 0.2,
            // A cap keeps a small model from looping until the timeout.
            max_tokens: cfg.maxTokens ?? 1024,
          }),
        });
        if (!res.ok) {
          throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
        }
        const data = await res.json();
        const msg = data.choices?.[0]?.message ?? {};
        return {
          content: stripThinking(msg.content ?? null),
          toolCalls: (msg.tool_calls ?? []).map((c: ToolCall, i: number) => ({
            id: c.id || `call_${i}`,
            type: "function",
            function: {
              name: c.function?.name ?? "",
              arguments:
                typeof c.function?.arguments === "string"
                  ? c.function.arguments
                  : JSON.stringify(c.function?.arguments ?? {}),
            },
          })),
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
