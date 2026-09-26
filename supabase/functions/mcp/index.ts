// POST /mcp — remote MCP server (Streamable HTTP, stateless, JSON responses).
//
// Exposes the domain tools of one hotel to MCP clients (Claude Desktop, Claude
// Code, other agents). Auth: "Authorization: Bearer dsm_…", a token a hotel
// admin creates in the panel; it fixes the hotel and the scopes (read / write).
// Every tool call is metered per hotel in usage_events.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { adminClient } from "../_shared/http.ts";
import { bearerToken, sha256Hex, type TokenGrant } from "../_shared/mcp/auth.ts";
import { createMcpServer } from "../_shared/mcp/server.ts";
import { supabaseToolStore } from "../_shared/tools/supabase-store.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, accept, mcp-session-id, mcp-protocol-version, last-event-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id, www-authenticate",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

function rpcError(status: number, code: number, message: string, extra: HeadersInit = {}) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }), {
    status,
    headers: { ...cors, "Content-Type": "application/json", ...extra },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // Stateless server: no standalone SSE stream (GET) and no sessions (DELETE).
  if (req.method !== "POST") {
    return rpcError(405, -32000, "Method not allowed", { Allow: "POST, OPTIONS" });
  }

  const token = bearerToken(req.headers.get("Authorization"));
  const db = adminClient();
  const { data: grant } = token
    ? await db.rpc("mcp_token_auth", { p_token_hash: await sha256Hex(token) })
    : { data: null };
  if (!grant) {
    return rpcError(401, -32001, "Invalid, expired or revoked token", {
      "WWW-Authenticate": 'Bearer realm="demo-stays", error="invalid_token"',
    });
  }
  const g = grant as TokenGrant;

  const { data: tenant } = await db
    .from("tenants")
    .select("name, domain")
    .eq("id", g.tenant_id)
    .single();
  // Links for the guest (manage / pay): PUBLIC_WEB_URL when one web serves
  // every hotel (the demo), otherwise the hotel's own domain.
  const webUrl =
    Deno.env.get("PUBLIC_WEB_URL") ??
    (tenant?.domain ? `https://${tenant.domain}` : "https://demostays.example");

  const server = createMcpServer({
    store: supabaseToolStore(db),
    ctx: { tenantId: g.tenant_id, userId: null, channel: "mcp", webUrl, now: new Date() },
    scopes: g.scopes,
    hotelName: tenant?.name ?? "the hotel",
    recentCalls: Number(g.calls_last_minute),
    async onToolCall(log) {
      await db.from("usage_events").insert({
        tenant_id: g.tenant_id,
        metric: "mcp.tool_call",
        quantity: 1,
        unit: "call",
        metadata: {
          token_id: g.token_id,
          tool: log.tool,
          ok: log.ok,
          error_code: log.code,
          latency_ms: log.latencyMs,
        },
      });
    },
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return withCors(await transport.handleRequest(req));
  } catch (e) {
    console.error(`mcp failed: ${(e as Error).message}`);
    return rpcError(500, -32603, "Internal error");
  } finally {
    await server.close().catch(() => {});
  }
});
