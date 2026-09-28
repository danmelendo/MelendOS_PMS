// Email providers. Resend when the project has RESEND_API_KEY and EMAIL_FROM;
// otherwise "simulated": nothing leaves the server and the email stays in the
// log as simulated (the demo, whose guests are fictitious).
import type { EmailTransport } from "./dispatch.ts";

export function resendTransport(apiKey: string): EmailTransport {
  return {
    mode: "resend",
    async send(e) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: e.from,
          to: [e.to],
          ...(e.replyTo ? { reply_to: e.replyTo } : {}),
          subject: e.subject,
          html: e.html,
          text: e.text,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) throw new Error(`Resend ${res.status}: ${body.message ?? "error"}`);
      return { id: body.id ?? null };
    },
  };
}

export const simulatedTransport: EmailTransport = {
  mode: "simulated",
  async send() {
    return { id: null };
  },
};

export function emailTransport(env: { get(name: string): string | undefined }): {
  transport: EmailTransport;
  fromAddress: string;
} {
  const key = env.get("RESEND_API_KEY");
  const from = env.get("EMAIL_FROM");
  return key && from
    ? { transport: resendTransport(key), fromAddress: from }
    : { transport: simulatedTransport, fromAddress: from ?? "reservas@demostays.example" };
}
