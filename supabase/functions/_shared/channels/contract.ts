// The contract between the PMS and a distribution channel (OTA, channel
// manager, tour operator). Provider-neutral on purpose: an adapter for each
// provider (Booking.com, Expedia, a channel manager, a tour operator's XML…)
// translates to and from this. Documented in docs/channels.md.
//
// Inbound: POST /functions/v1/channel-webhook?channel=<id> with the JSON body
// below and the header X-Signature: hex HMAC-SHA256 of the raw body with the
// channel's secret.
import { z } from "zod";
import { isYmd, nightsBetween } from "../domain/dates.ts";

const ymd = z.string().refine(isYmd, "Date must be yyyy-MM-dd");

export const channelEvent = z
  .object({
    event: z.enum(["reservation.created", "reservation.modified", "reservation.cancelled"]),
    /** The channel's own booking id; the same one in every event of a booking. */
    external_ref: z.string().trim().min(1).max(80),
    /** Channel room type code, mapped to a room type in the channel settings. */
    room_code: z.string().trim().min(1).max(60).optional(),
    check_in: ymd.optional(),
    check_out: ymd.optional(),
    guests: z.number().int().min(1).max(12).optional(),
    guest: z
      .object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(200).optional(),
        phone: z.string().trim().max(40).optional(),
      })
      .optional(),
    /** Price of the stay agreed on the channel (EUR). */
    total: z.number().nonnegative().max(100000).optional(),
    currency: z.literal("EUR").default("EUR"),
    /** The guest already paid the channel (it pays the hotel later). */
    paid_to_channel: z.boolean().default(false),
    notes: z.string().trim().max(1000).optional(),
  })
  .superRefine((e, ctx) => {
    if (e.event === "reservation.cancelled") return;
    for (const k of ["room_code", "check_in", "check_out", "guests", "guest", "total"] as const) {
      if (e[k] === undefined) ctx.addIssue({ code: "custom", path: [k], message: "Required" });
    }
    if (e.check_in && e.check_out) {
      const n = nightsBetween(e.check_in, e.check_out);
      if (n < 1 || n > 60)
        ctx.addIssue({ code: "custom", path: ["check_out"], message: "1-60 nights" });
    }
  });

export type ChannelEvent = z.output<typeof channelEvent>;

const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Hex HMAC-SHA256 of a body with a channel secret. */
export async function signBody(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
}

/** Constant-time comparison of the X-Signature header with the expected one. */
export async function verifySignature(
  secret: string,
  body: string,
  signature: string | null,
): Promise<boolean> {
  if (!signature) return false;
  const expected = await signBody(secret, body);
  const given = signature.trim().toLowerCase();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
