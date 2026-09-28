import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { tripleDesCbcEncrypt } from "./des.ts";
import {
  buildOrder,
  buildPaymentForm,
  deriveOrderKey,
  refund,
  sign,
  verifyNotification,
} from "./redsys.ts";

// Any 24-byte key works for signature tests; generated so no key lives in code.
const TEST_KEY = randomBytes(24).toString("base64");

function opensslTripleDes(key: Buffer, data: Buffer): Buffer {
  const c = createCipheriv("des-ede3-cbc", key, Buffer.alloc(8));
  c.setAutoPadding(false);
  return Buffer.concat([c.update(data), c.final()]);
}

describe("3DES-CBC", () => {
  it("matches OpenSSL on random keys and data", () => {
    for (let i = 0; i < 25; i++) {
      const key = randomBytes(24);
      const data = randomBytes(8 * (1 + (i % 4)));
      const ours = Buffer.from(tripleDesCbcEncrypt(new Uint8Array(key), new Uint8Array(data)));
      expect(ours.toString("hex")).toBe(opensslTripleDes(key, data).toString("hex"));
    }
  });

  it("rejects bad key or data sizes", () => {
    expect(() => tripleDesCbcEncrypt(new Uint8Array(16), new Uint8Array(8))).toThrow();
    expect(() => tripleDesCbcEncrypt(new Uint8Array(24), new Uint8Array(7))).toThrow();
  });
});

describe("Redsys signature", () => {
  it("derives the order key like OpenSSL and signs like Node's HMAC", async () => {
    const order = "1446068581";
    const params = Buffer.from(JSON.stringify({ DS_MERCHANT_ORDER: order })).toString("base64");
    const padded = Buffer.alloc(16);
    padded.write(order);
    const expectedKey = opensslTripleDes(Buffer.from(TEST_KEY, "base64"), padded);
    expect(Buffer.from(deriveOrderKey(TEST_KEY, order)).toString("hex")).toBe(
      expectedKey.toString("hex"),
    );
    const expectedSig = createHmac("sha256", expectedKey).update(params).digest("base64");
    expect(await sign(TEST_KEY, order, params)).toBe(expectedSig);
  });

  it("builds a form with the amount in cents and a verifiable signature", async () => {
    const order = buildOrder(1_790_000_000_000, 0.5);
    const form = await buildPaymentForm({
      merchantCode: "999008881",
      terminal: "1",
      secretKeyB64: TEST_KEY,
      order,
      amount: 115.5,
      notificationUrl: "https://example.test/notify",
      urlOk: "https://example.test/ok",
      urlKo: "https://example.test/ko",
      environment: "test",
    });
    expect(form.url).toContain("sis-t.redsys.es");
    const params = JSON.parse(Buffer.from(form.fields.Ds_MerchantParameters, "base64").toString());
    expect(params.DS_MERCHANT_AMOUNT).toBe("11550");
    expect(params.DS_MERCHANT_ORDER).toBe(order);
    expect(order).toMatch(/^\d{4}[0-9a-z]{4,8}$/);
    expect(form.fields.Ds_Signature).toBe(
      await sign(TEST_KEY, order, form.fields.Ds_MerchantParameters),
    );
  });
});

describe("Redsys notification", () => {
  async function notification(fields: Record<string, string>) {
    const params = Buffer.from(JSON.stringify(fields)).toString("base64");
    return { params, signature: await sign(TEST_KEY, fields.Ds_Order, params) };
  }

  it("accepts a correctly signed authorised payment", async () => {
    const n = await notification({ Ds_Order: "1234abcd", Ds_Amount: "11550", Ds_Response: "0000" });
    const v = await verifyNotification(TEST_KEY, n.params, n.signature);
    expect(v).toMatchObject({ order: "1234abcd", amount: 115.5, authorised: true });
  });

  it("accepts url-safe signatures as Redsys sends them", async () => {
    const n = await notification({ Ds_Order: "1234abcd", Ds_Amount: "100", Ds_Response: "0000" });
    const urlSafe = n.signature.replace(/\+/g, "-").replace(/\//g, "_");
    await expect(verifyNotification(TEST_KEY, n.params, urlSafe)).resolves.toBeTruthy();
  });

  it("marks declined payments as not authorised", async () => {
    const n = await notification({ Ds_Order: "1234abcd", Ds_Amount: "100", Ds_Response: "0190" });
    expect((await verifyNotification(TEST_KEY, n.params, n.signature)).authorised).toBe(false);
  });

  it("rejects tampered parameters or a wrong key", async () => {
    const n = await notification({ Ds_Order: "1234abcd", Ds_Amount: "100", Ds_Response: "0000" });
    const tampered = Buffer.from(
      JSON.stringify({ Ds_Order: "1234abcd", Ds_Amount: "1", Ds_Response: "0000" }),
    ).toString("base64");
    await expect(verifyNotification(TEST_KEY, tampered, n.signature)).rejects.toThrow(/signature/);
    const otherKey = Buffer.from(randomBytes(24)).toString("base64");
    await expect(verifyNotification(otherKey, n.params, n.signature)).rejects.toThrow(/signature/);
  });
});

describe("Redsys refunds", () => {
  const req = {
    merchantCode: "999008881",
    terminal: "1",
    secretKeyB64: TEST_KEY,
    order: "840376792n8q",
    amount: 90,
    environment: "test" as const,
  };
  // What Redsys answers: parameters signed with the hotel's key.
  const answer = async (response: string, key = TEST_KEY) => {
    const params = Buffer.from(
      JSON.stringify({ Ds_Order: req.order, Ds_Amount: "9000", Ds_Response: response }),
    ).toString("base64");
    return {
      Ds_SignatureVersion: "HMAC_SHA256_V1",
      Ds_MerchantParameters: params,
      Ds_Signature: await sign(key, req.order, params),
    };
  };
  const fetchWith = (body: unknown, sent: unknown[] = []) =>
    (async (url: string, init?: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;

  it("asks for operation 3 on the original order, signed, and accepts only 0900", async () => {
    const sent: { url: string; body: { Ds_MerchantParameters: string } }[] = [];
    const ok = await refund(req, fetchWith(await answer("0900"), sent));
    expect(ok).toEqual({ ok: true, code: "0900" });
    expect(sent[0].url).toBe("https://sis-t.redsys.es:25443/sis/rest/trataPeticionREST");
    const params = JSON.parse(Buffer.from(sent[0].body.Ds_MerchantParameters, "base64").toString());
    expect(params).toMatchObject({
      DS_MERCHANT_TRANSACTIONTYPE: "3",
      DS_MERCHANT_ORDER: "840376792n8q",
      DS_MERCHANT_AMOUNT: "9000",
    });
    expect(await refund(req, fetchWith(await answer("0190")))).toEqual({ ok: false, code: "0190" });
    expect(await refund(req, fetchWith({ errorCode: "SIS0054" }))).toEqual({
      ok: false,
      code: "SIS0054",
    });
  });

  it("never takes a forged answer as a refund", async () => {
    const forged = await answer("0900", randomBytes(24).toString("base64"));
    await expect(refund(req, fetchWith(forged))).rejects.toThrow(/signature/);
  });
});
