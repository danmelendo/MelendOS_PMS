// MCP server over the domain tools (the same ones the booking agent uses).
// One server per request: the hotel and the scopes come from the access token,
// checked by the caller (the mcp Edge Function), never from the MCP client.
// 'read' lists the read-only tools; 'write' adds the ones that create
// something. None of them is irreversible (see tools/registry.ts).
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { runTool, toolSchemas, type ToolContext, type ToolStore } from "../tools/registry.ts";

export type Scope = "read" | "write";

export const SERVER_INFO = { name: "demo-stays", version: "1.0.0" };

/** Tool calls per token and minute. */
export const RATE_LIMIT_PER_MINUTE = 60;

const TITLES: Record<string, string> = {
  search_availability: "Search availability",
  get_unit_details: "Room details",
  quote_price: "Quote a stay",
  create_booking_draft: "Create a booking",
  create_payment_link: "Payment link",
  get_booking: "Look up a booking",
  cancel_booking: "Cancel a booking",
};

export function toolAllowed(readOnly: boolean, scopes: readonly string[]): boolean {
  return scopes.includes(readOnly ? "read" : "write");
}

/** The tools a token can see, as MCP tool definitions. */
export function mcpTools(scopes: readonly string[]): Tool[] {
  return toolSchemas()
    .filter((t) => toolAllowed(t.read_only, scopes))
    .map((t) => {
      const { $schema: _drop, ...inputSchema } = t.input_schema;
      return {
        name: t.name,
        title: TITLES[t.name],
        description: t.description,
        inputSchema: inputSchema as Tool["inputSchema"],
        annotations: {
          title: TITLES[t.name],
          readOnlyHint: t.read_only,
          // Drafts and links change nothing for good; cancel_booking can
          // cancel a booking (inside the free window, after confirm: true).
          destructiveHint: t.name === "cancel_booking",
          idempotentHint: t.read_only,
          openWorldHint: false,
        },
      };
    });
}

export interface ToolCallLog {
  tool: string;
  ok: boolean;
  code: string | null;
  latencyMs: number;
}

export interface McpServerOptions {
  store: ToolStore;
  ctx: ToolContext;
  scopes: readonly string[];
  hotelName: string;
  /** Tool calls already made by this token in the last minute. */
  recentCalls?: number;
  /** Metering: one call per tool run (usage_events). */
  onToolCall?: (log: ToolCallLog) => Promise<void> | void;
}

const errorResult = (code: string, message: string): CallToolResult => ({
  isError: true,
  content: [{ type: "text", text: JSON.stringify({ error: { code, message } }) }],
});

export function createMcpServer(opts: McpServerOptions): Server {
  const { store, ctx, scopes } = opts;
  const server = new Server(SERVER_INFO, {
    capabilities: { tools: {} },
    instructions:
      `Booking tools of ${opts.hotelName}. Dates are yyyy-MM-dd; prices are in EUR and come ` +
      `only from the tools. Bookings are created pending (paid online) or confirmed (paid at ` +
      `the hotel). cancel_booking shows the terms first (confirm false) and cancels with confirm true inside the free window; later it files a request the hotel decides on. ` +
      (scopes.includes("write")
        ? "This token can read and create bookings."
        : "This token is read-only."),
  });

  let calls = opts.recentCalls ?? 0;

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpTools(scopes) }));

  server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
    const name = req.params.name;
    const def = toolSchemas().find((t) => t.name === name);
    if (!def) return errorResult("unknown_tool", `Unknown tool ${name}`);
    if (!toolAllowed(def.read_only, scopes)) {
      return errorResult("forbidden", `${name} needs a token with the 'write' scope`);
    }
    if (++calls > RATE_LIMIT_PER_MINUTE) {
      return errorResult("rate_limited", `Limit of ${RATE_LIMIT_PER_MINUTE} tool calls per minute`);
    }

    const started = Date.now();
    const out = await runTool(name, req.params.arguments ?? {}, store, ctx);
    await opts.onToolCall?.({
      tool: name,
      ok: out.ok,
      code: out.ok ? null : out.error.code,
      latencyMs: Date.now() - started,
    });
    if (!out.ok) return errorResult(out.error.code, out.error.message);
    return {
      content: [{ type: "text", text: JSON.stringify(out.data) }],
      structuredContent: out.data as Record<string, unknown>,
    };
  });

  return server;
}
