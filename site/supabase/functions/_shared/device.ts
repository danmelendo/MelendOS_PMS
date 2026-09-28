// Trusted devices of the management panel. Each browser keeps an ECDSA P-256
// key pair whose private half cannot be exported; it signs the Supabase
// session it is using, and the device-session function checks the signature
// against the public key the database has for that device. Shared by the
// browser (signing) and the function (verifying); plain WebCrypto, no deps.

export const DEVICE_ALGORITHM = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;

/** How old a signed proof may be when it reaches the function. */
export const MAX_PROOF_AGE_MS = 2 * 60_000;

/** What a device signs: this session, at this moment. */
export function deviceMessage(sessionId: string, timestamp: number): string {
  return `melendos-device:v1:${sessionId}:${timestamp}`;
}

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function signDeviceMessage(privateKey: CryptoKey, message: string): Promise<string> {
  const sig = await crypto.subtle.sign(SIGN, privateKey, new TextEncoder().encode(message));
  return toBase64Url(sig);
}

/** True only for a valid signature of `message` by the key in `jwk`. */
export async function verifyDeviceSignature(
  jwk: JsonWebKey,
  message: string,
  signature: string,
): Promise<boolean> {
  try {
    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || jwk.d) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, DEVICE_ALGORITHM, false, ["verify"]);
    const sig = fromBase64Url(signature);
    if (sig.length !== 64) return false;
    return await crypto.subtle.verify(SIGN, key, sig, new TextEncoder().encode(message));
  } catch {
    return false;
  }
}

/** A proof is only good for a short while (no replaying an old one). */
export function freshProof(timestamp: number, now = Date.now()): boolean {
  return Number.isFinite(timestamp) && Math.abs(now - timestamp) <= MAX_PROOF_AGE_MS;
}

/** A readable name for the device, from the browser ("Windows · Chrome"). */
export function deviceName(userAgent: string): string {
  const os = /Windows/i.test(userAgent)
    ? "Windows"
    : /iPhone|iPad/i.test(userAgent)
      ? "iPhone/iPad"
      : /Android/i.test(userAgent)
        ? "Android"
        : /Mac OS X|Macintosh/i.test(userAgent)
          ? "Mac"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "Equipo";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "navegador";
  return `${os} · ${browser}`;
}
