import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FUNCTIONS_URL, supabase } from "@/integrations/supabase/client";

// Access tokens for the hotel's MCP server (create_mcp_token, list_mcp_tokens,
// revoke_mcp_token).

export type McpScope = "read" | "write";

export interface McpToken {
  id: string;
  name: string;
  token_prefix: string;
  scopes: McpScope[];
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  calls_30d: number;
}

export interface NewMcpToken {
  id: string;
  /** Shown once: only its hash is stored. */
  token: string;
  token_prefix: string;
  scopes: McpScope[];
  expires_at: string;
}

export const MCP_URL = FUNCTIONS_URL
  ? `${FUNCTIONS_URL}/mcp`
  : "https://<proyecto>.supabase.co/functions/v1/mcp";

export const tokenStatus = (t: McpToken, now = new Date()) =>
  t.revoked_at ? "revoked" : new Date(t.expires_at) <= now ? "expired" : "active";

/** Ready-to-paste setup for Claude Code and Claude Desktop. */
export function mcpSnippets(token: string, name = "demo-stays") {
  return {
    claudeCode: `claude mcp add --transport http ${name} ${MCP_URL} --header "Authorization: Bearer ${token}"`,
    claudeDesktop: JSON.stringify(
      {
        mcpServers: {
          [name]: {
            command: "npx",
            args: ["-y", "mcp-remote", MCP_URL, "--header", "Authorization:${AUTH_HEADER}"],
            env: { AUTH_HEADER: `Bearer ${token}` },
          },
        },
      },
      null,
      2,
    ),
  };
}

export function useMcpTokens(tenantId: string | null) {
  return useQuery({
    queryKey: ["mcp_tokens", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_mcp_tokens", { p_tenant: tenantId! });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as McpToken[];
    },
  });
}

export function useCreateMcpToken(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; scopes: McpScope[]; days: number }) => {
      const { data, error } = await supabase.rpc("create_mcp_token", {
        p_tenant: tenantId!,
        p_name: input.name,
        p_scopes: input.scopes,
        p_days: input.days,
      });
      if (error) throw new Error(error.message);
      return data as unknown as NewMcpToken;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp_tokens", tenantId] }),
  });
}

export function useRevokeMcpToken(tenantId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("revoke_mcp_token", { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp_tokens", tenantId] }),
  });
}
