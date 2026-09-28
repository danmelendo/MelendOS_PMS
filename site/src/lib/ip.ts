// Addresses for the panel's IP allowlist (the database decides; this only
// helps the page tell which of your addresses are already covered, and what
// to add for each).

/** The address as bits (IPv4: 32, IPv6: 128), or null if it is not one. */
function bits(ip: string): string | null {
  if (ip.includes(".")) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255))
      return null;
    return parts.map((p) => p.toString(2).padStart(8, "0")).join("");
  }
  if (!ip.includes(":")) return null;
  const [head, tail = ""] = ip.split("::");
  const a = head ? head.split(":") : [];
  const b = ip.includes("::") && tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...a, ...Array(8 - a.length - b.length).fill("0"), ...b] : a;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return groups.map((g) => parseInt(g, 16).toString(2).padStart(16, "0")).join("");
}

/** Whether an address falls in a network ("a.b.c.d/n", "x:y::/n" or a lone address). */
export function inRange(ip: string, network: string): boolean {
  const [base, len] = network.split("/");
  const a = bits(ip);
  const n = bits(base);
  if (!a || !n || a.length !== n.length) return false;
  const prefix = len === undefined ? a.length : Number(len);
  return a.slice(0, prefix) === n.slice(0, prefix);
}

/**
 * What to allow for your own connection: the exact IPv4 address, or the /64
 * of an IPv6 one (home connections change the end of it every so often).
 */
export function allowFor(ip: string): string {
  return ip.includes(":") ? `${ip}/64` : ip;
}
