import { describe, expect, it } from "vitest";
import {
  DEVICE_ALGORITHM,
  MAX_PROOF_AGE_MS,
  deviceMessage,
  deviceName,
  freshProof,
  signDeviceMessage,
  verifyDeviceSignature,
} from "./device.ts";

async function device() {
  const pair = (await crypto.subtle.generateKey(DEVICE_ALGORITHM, false, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  return { pair, jwk: await crypto.subtle.exportKey("jwk", pair.publicKey) };
}

describe("device signatures", () => {
  it("accept the device's own signature of this session", async () => {
    const d = await device();
    const msg = deviceMessage("session-1", 1790000000000);
    const sig = await signDeviceMessage(d.pair.privateKey, msg);
    expect(await verifyDeviceSignature(d.jwk, msg, sig)).toBe(true);
  });

  it("reject another session, another device, garbage and a private key", async () => {
    const a = await device();
    const b = await device();
    const sig = await signDeviceMessage(a.pair.privateKey, deviceMessage("s1", 1));
    expect(await verifyDeviceSignature(a.jwk, deviceMessage("s2", 1), sig)).toBe(false);
    expect(await verifyDeviceSignature(b.jwk, deviceMessage("s1", 1), sig)).toBe(false);
    expect(await verifyDeviceSignature(a.jwk, deviceMessage("s1", 1), "abc")).toBe(false);
    expect(
      await verifyDeviceSignature({ ...a.jwk, d: "secret" }, deviceMessage("s1", 1), sig),
    ).toBe(false);
  });

  it("keeps the private key inside the browser", async () => {
    const d = await device();
    await expect(crypto.subtle.exportKey("jwk", d.pair.privateKey)).rejects.toThrow();
  });

  it("only takes recent proofs", () => {
    const now = 1_790_000_000_000;
    expect(freshProof(now - 10_000, now)).toBe(true);
    expect(freshProof(now - MAX_PROOF_AGE_MS - 1, now)).toBe(false);
    expect(freshProof(Number.NaN, now)).toBe(false);
  });
});

describe("deviceName", () => {
  it("names the system and the browser", () => {
    expect(
      deviceName(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
      ),
    ).toBe("Windows · Chrome");
    expect(
      deviceName(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("iPhone/iPad · Safari");
    expect(deviceName("Mozilla/5.0 (Windows NT 10.0) Chrome/140 Edg/140")).toBe("Windows · Edge");
  });
});
