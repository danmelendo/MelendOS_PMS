// End-to-end check of the MCP server against the demo project, with the
// official MCP client over HTTP: a hotel admin creates tokens in the panel
// (create_mcp_token), a read token only sees and runs the read-only tools, a
// write token books, calls are metered and a revoked token stops working.
// Test data is removed at the end.
// Usage: node --env-file=.env scripts/e2e-mcp.mjs
import { createClient } from "@supabase/supabase-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env;
const MCP_URL = new URL(`${SUPABASE_URL}/functions/v1/mcp`);
const service = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!cond) failures++;
};
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** A signed-in session for a demo account (magic link generated server-side). */
async function signIn(email) {
  const { data, error } = await service.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
  const { error: e2 } = await client.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (e2) throw e2;
  return client;
}

async function mcp(token) {
  const client = new Client({ name: "e2e-mcp", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(MCP_URL, {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
  return client;
}
const result = (r) => JSON.parse(r.content[0].text);

const tokenIds = [];
let reservationId = null;
try {
  const { data: tenant } = await service
    .from("tenants")
    .select("id")
    .eq("slug", "hotel-lumen")
    .single();
  // AI integrations are set up by Melend/OS support (platform role).
  const admin = await signIn("soporte@demostays.example");
  const reception = await signIn("recepcion@lumen.demostays.example");
  const management = await signIn("admin@lumen.demostays.example");

  const denied = await reception.rpc("create_mcp_token", {
    p_tenant: tenant.id,
    p_name: "Recepción",
    p_scopes: ["read"],
  });
  check("reception cannot create MCP tokens", !!denied.error, denied.error?.message);
  const byManagement = await management.rpc("create_mcp_token", {
    p_tenant: tenant.id,
    p_name: "Dirección",
    p_scopes: ["read"],
  });
  check("hotel management cannot either", !!byManagement.error, byManagement.error?.message);

  const mk = async (name, scopes) => {
    const { data, error } = await admin.rpc("create_mcp_token", {
      p_tenant: tenant.id,
      p_name: name,
      p_scopes: scopes,
      p_days: 1,
    });
    if (error) throw error;
    tokenIds.push(data.id);
    return data;
  };
  const read = await mk("e2e lectura", ["read"]);
  const write = await mk("e2e escritura", ["write"]);
  check("support creates tokens", /^dsm_[0-9a-f]{48}$/.test(read.token), read.token_prefix);
  check("write scope implies read", write.scopes.join() === "read,write", write.scopes.join());

  const noAuth = await fetch(MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  check("no token: 401", noAuth.status === 401, `HTTP ${noAuth.status}`);

  const reader = await mcp(read.token);
  const readTools = (await reader.listTools()).tools.map((t) => t.name);
  check("read token lists 6 read-only tools", readTools.length === 6, readTools.join(", "));

  const search = await reader.callTool({
    name: "search_availability",
    arguments: { check_in: day(340), check_out: day(342), guests: 2 },
  });
  const rooms = search.structuredContent?.results ?? [];
  check(
    "search_availability over MCP",
    !search.isError && rooms.length > 0,
    `${rooms.length} rooms`,
  );

  const forbidden = await reader.callTool({
    name: "create_booking_draft",
    arguments: {
      room_id: rooms[0]?.room_id,
      check_in: day(340),
      check_out: day(342),
      guests: 2,
      customer: { name: "Prueba MCP", email: "mcp-e2e@example.com" },
      payment_mode: "at_hotel",
    },
  });
  check("read token cannot book", result(forbidden).error?.code === "forbidden");
  await reader.close();

  const writer = await mcp(write.token);
  check("write token lists 9 tools", (await writer.listTools()).tools.length === 9);
  const booked = await writer.callTool({
    name: "create_booking_draft",
    arguments: {
      room_id: rooms[0]?.room_id,
      check_in: day(340),
      check_out: day(342),
      guests: 2,
      customer: { name: "Prueba MCP", email: "mcp-e2e@example.com" },
      payment_mode: "at_hotel",
    },
  });
  const draft = booked.structuredContent ?? result(booked);
  reservationId = draft.reservation_id ?? null;
  check("write token books (paid at the hotel)", draft.status === "confirmed", draft.status);
  const { data: row } = await service
    .from("reservations")
    .select("tenant_id, created_by_role")
    .eq("id", reservationId)
    .single();
  check(
    "booking recorded in the token's hotel as channel mcp",
    row?.tenant_id === tenant.id && row?.created_by_role === "mcp",
    JSON.stringify(row),
  );
  const lookup = await writer.callTool({
    name: "get_booking",
    arguments: { reference: draft.reference, email: "mcp-e2e@example.com" },
  });
  check("get_booking finds it", lookup.structuredContent?.reference === draft.reference);
  await writer.close();

  const { data: listed } = await admin.rpc("list_mcp_tokens", { p_tenant: tenant.id });
  const mine = listed.filter((t) => tokenIds.includes(t.id));
  // The refused call (read token trying to book) never ran, so it is not metered.
  check(
    "calls are metered per token",
    mine.find((t) => t.id === read.id)?.calls_30d === 1 &&
      mine.find((t) => t.id === write.id)?.calls_30d === 2,
    mine.map((t) => `${t.name}: ${t.calls_30d}`).join(", "),
  );
  check(
    "the list never returns the token or its hash",
    !JSON.stringify(listed).includes(read.token) && !JSON.stringify(listed).includes("hash"),
  );

  const revoked = await admin.rpc("revoke_mcp_token", { p_id: read.id });
  check("admin revokes a token", !revoked.error, revoked.error?.message);
  let refused = false;
  try {
    await mcp(read.token);
  } catch {
    refused = true;
  }
  check("a revoked token is refused", refused);
} catch (e) {
  check("unexpected error", false, e.message);
} finally {
  if (reservationId) await service.from("reservations").delete().eq("id", reservationId);
  await service.from("customers").delete().eq("email", "mcp-e2e@example.com");
  if (tokenIds.length) {
    for (const id of tokenIds) {
      await service
        .from("usage_events")
        .delete()
        .eq("metric", "mcp.tool_call")
        .eq("metadata->>token_id", id);
    }
    await service.from("domain_events").delete().in("entity_id", tokenIds);
    await service.from("mcp_tokens").delete().in("id", tokenIds);
  }
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
