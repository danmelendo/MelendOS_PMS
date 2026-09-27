import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { fakeStore } from "../tools/testing.ts";
import type { ToolContext } from "../tools/registry.ts";
import { bearerToken, sha256Hex } from "./auth.ts";
import { createMcpServer, RATE_LIMIT_PER_MINUTE, type ToolCallLog } from "./server.ts";

const ctx: ToolContext = {
  tenantId: "t1",
  userId: null,
  channel: "mcp",
  webUrl: "https://hotel.example",
  now: new Date("2026-09-25T10:00:00Z"),
};
const stay = { check_in: "2026-10-01", check_out: "2026-10-03" };
const draft = {
  room_id: "r-101",
  ...stay,
  guests: 2,
  customer: { name: "Laura Gómez", email: "laura@example.com" },
  payment_mode: "at_hotel",
};

async function connect(scopes: string[], recentCalls = 0) {
  const fake = fakeStore();
  const logs: ToolCallLog[] = [];
  const server = createMcpServer({
    store: fake.store,
    ctx,
    scopes,
    hotelName: "Hotel Uno",
    recentCalls,
    onToolCall: (l) => void logs.push(l),
  });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, logs, ...fake };
}

const text = (r: unknown) =>
  JSON.parse((r as { content: { text: string }[] }).content[0].text) as Record<string, unknown>;

describe("MCP server", () => {
  it("lists only the read-only tools for a read token", async () => {
    const { client } = await connect(["read"]);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      "search_availability",
      "get_unit_details",
      "quote_price",
      "list_extras",
      "get_booking",
      "recover_booking",
    ]);
    for (const t of tools) {
      expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      expect(t.inputSchema.type).toBe("object");
    }
    expect(JSON.stringify(tools)).not.toContain("tenant");
    expect(client.getInstructions()).toContain("read-only");
  });

  it("adds the tools that create something for a write token", async () => {
    const { client } = await connect(["read", "write"]);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(9);
    const write = tools.filter((t) => !t.annotations?.readOnlyHint).map((t) => t.name);
    expect(write).toEqual(["create_booking_draft", "create_payment_link", "cancel_booking"]);
  });

  it("runs a tool on the token's hotel and meters the call", async () => {
    const { client, logs } = await connect(["read"]);
    const res = await client.callTool({
      name: "search_availability",
      arguments: { ...stay, guests: 2 },
    });
    expect(res.isError).toBeFalsy();
    const data = res.structuredContent as { results: { room: string }[] };
    expect(data.results.map((r) => r.room)).toEqual(["102", "101", "201"]);
    expect(text(res)).toEqual(data);
    expect(logs).toEqual([
      { tool: "search_availability", ok: true, code: null, latencyMs: expect.any(Number) },
    ]);
  });

  it("refuses write tools to a read token, without running them", async () => {
    const { client, inserted, logs } = await connect(["read"]);
    const res = await client.callTool({ name: "create_booking_draft", arguments: draft });
    expect(res.isError).toBe(true);
    expect(text(res)).toMatchObject({ error: { code: "forbidden" } });
    expect(inserted).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  it("books through MCP, recorded as the mcp channel", async () => {
    const { client, inserted } = await connect(["read", "write"]);
    const res = await client.callTool({ name: "create_booking_draft", arguments: draft });
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toMatchObject({ status: "confirmed", payment_mode: "at_hotel" });
    expect(inserted[0]).toMatchObject({ tenant_id: "t1", created_by_role: "mcp" });
  });

  it("returns tool errors as results the client can read", async () => {
    const { client, logs } = await connect(["read"]);
    const bad = await client.callTool({
      name: "search_availability",
      arguments: { ...stay, guests: 0 },
    });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toMatchObject({ error: { code: "invalid" } });
    const other = await client.callTool({
      name: "get_unit_details",
      arguments: { room_id: "r-x1" },
    });
    expect(text(other)).toMatchObject({ error: { code: "not_found" } });
    expect(logs.map((l) => l.code)).toEqual(["invalid", "not_found"]);
    const unknown = await client.callTool({ name: "drop_tables", arguments: {} });
    expect(text(unknown)).toMatchObject({ error: { code: "unknown_tool" } });
  });

  it("limits the tool calls per minute of a token", async () => {
    const { client, logs } = await connect(["read"], RATE_LIMIT_PER_MINUTE);
    const res = await client.callTool({
      name: "get_unit_details",
      arguments: { room_id: "r-101" },
    });
    expect(text(res)).toMatchObject({ error: { code: "rate_limited" } });
    expect(logs).toHaveLength(0);
  });
});

describe("MCP tokens", () => {
  it("reads only well-formed bearer tokens", () => {
    const t = `dsm_${"a1".repeat(24)}`;
    expect(bearerToken(`Bearer ${t}`)).toBe(t);
    expect(bearerToken(`bearer ${t} `)).toBe(t);
    expect(bearerToken(t)).toBeNull();
    expect(bearerToken("Bearer eyJhbGciOiJIUzI1NiJ9.x.y")).toBeNull();
    expect(bearerToken(`Bearer ${t}' or 1=1`)).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  it("hashes like the database (sha256, hex)", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
