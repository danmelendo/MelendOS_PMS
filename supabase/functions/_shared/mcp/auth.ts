// MCP access tokens: "dsm_" + 48 hex characters, created by a hotel admin in
// the panel (create_mcp_token). Only the SHA-256 is stored.

const TOKEN = /^dsm_[0-9a-f]{48}$/;

/** The token from an "Authorization: Bearer dsm_…" header, or null. */
export function bearerToken(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return m && TOKEN.test(m[1]) ? m[1] : null;
}

export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** What mcp_token_auth() returns for a valid token. */
export interface TokenGrant {
  token_id: string;
  tenant_id: string;
  scopes: string[];
  calls_last_minute: number;
}
