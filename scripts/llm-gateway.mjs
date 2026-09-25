// Development only: exposes the local Ollama to the agent-chat Edge Function
// (which runs in Supabase's cloud) behind an API key, like a hosted provider.
// Put a tunnel in front of it (cloudflared tunnel --url http://localhost:11500)
// and set the function secrets LLM_BASE_URL=<tunnel>/v1, LLM_API_KEY and
// LLM_MODEL. Without the key nobody can use the GPU through the tunnel.
//
// Usage: node --env-file=.env scripts/llm-gateway.mjs
import http from "node:http";
import { timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.LLM_GATEWAY_PORT ?? 11500);
const UPSTREAM = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const KEY = process.env.LLM_API_KEY;
if (!KEY || KEY.length < 24) {
  console.error("LLM_API_KEY (24+ characters) is required in .env");
  process.exit(1);
}
const ALLOWED = new Set(["POST /v1/chat/completions", "GET /v1/models"]);

const authorized = (header = "") => {
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(KEY);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

http
  .createServer(async (req, res) => {
    const route = `${req.method} ${req.url?.split("?")[0]}`;
    if (!ALLOWED.has(route)) {
      res.writeHead(404).end();
      return;
    }
    if (!authorized(req.headers.authorization)) {
      res.writeHead(401, { "Content-Type": "application/json" }).end('{"error":"unauthorized"}');
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const started = Date.now();
    try {
      const upstream = await fetch(`${UPSTREAM}${req.url}`, {
        method: req.method,
        headers: { "Content-Type": "application/json" },
        body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
      });
      const body = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.status, { "Content-Type": "application/json" }).end(body);
      console.log(`${route} ${upstream.status} ${Date.now() - started} ms`);
    } catch (e) {
      res.writeHead(502, { "Content-Type": "application/json" }).end('{"error":"upstream"}');
      console.error(`${route} failed: ${e.message}`);
    }
  })
  .listen(PORT, "127.0.0.1", () =>
    console.log(`LLM gateway on http://127.0.0.1:${PORT} → ${UPSTREAM} (key required)`),
  );
