# MCP server

Each hotel exposes its booking tools through a remote
[Model Context Protocol](https://modelcontextprotocol.io) server, so AI
assistants (Claude Desktop, Claude Code, other agents) can check availability,
quote and book on its behalf. The tools are the same ones the booking agent on
the website uses (`supabase/functions/_shared/tools/registry.ts`).

- **Endpoint:** `https://<project>.supabase.co/functions/v1/mcp` (Streamable
  HTTP, stateless, JSON responses). Source: `supabase/functions/mcp/`.
- **Auth:** `Authorization: Bearer dsm_…`. A hotel admin creates tokens in the
  panel (**Admin → Integraciones IA**). A token belongs to one hotel, expires
  (30 days to 1 year) and can be revoked at once. Only its SHA-256 is stored.
- **Scopes:**

  | Scope   | Tools                                                                          |
  | ------- | ------------------------------------------------------------------------------ |
  | `read`  | `search_availability`, `get_unit_details`, `quote_price`, `get_booking`        |
  | `write` | the above plus `create_booking_draft`, `create_payment_link`, `cancel_booking` |

  Online bookings stay pending until the guest pays. `cancel_booking` verifies
  the guest (reference, email, arrival date), returns the terms with
  `confirm: false` and cancels with `confirm: true` inside the free window
  (refund flagged if paid online); after it, it files a request the hotel
  decides on. It is the only tool marked `destructiveHint: true`. Tools carry MCP
  annotations (`readOnlyHint`, `destructiveHint: false`).

- **Limits and metering:** 60 tool calls per token and minute. Each call is
  recorded in `usage_events` (`metric = 'mcp.tool_call'`) with the token, the
  tool, the outcome and the latency; bookings made through MCP have
  `created_by_role = 'mcp'`.

## Connect

Claude Code:

```sh
claude mcp add --transport http demo-stays https://<project>.supabase.co/functions/v1/mcp \
  --header "Authorization: Bearer dsm_…"
```

Claude Desktop (`claude_desktop_config.json`, needs Node.js):

```json
{
  "mcpServers": {
    "demo-stays": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://<project>.supabase.co/functions/v1/mcp",
        "--header",
        "Authorization:${AUTH_HEADER}"
      ],
      "env": { "AUTH_HEADER": "Bearer dsm_…" }
    }
  }
}
```

The panel shows both snippets with the real URL and token when the token is
created.

## Test

- Unit: `supabase/functions/_shared/mcp/server.test.ts` (official MCP client
  over an in-memory transport, fake store).
- Database: `npm run test:db` (who can create, list and revoke tokens).
- End to end against the demo project:
  `node --env-file=.env scripts/e2e-mcp.mjs`.
