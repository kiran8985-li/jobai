import "server-only";
import type { Sender } from "./run";

/**
 * Sends through Resend's HTTP API. The Idempotency-Key means that if the same application is
 * ever submitted twice, Resend delivers it once.
 */
export function createResendSender(apiKey: string | undefined, fetchImpl: typeof fetch = fetch): Sender | null {
  if (!apiKey) return null;
  return async (email, attachment, idempotencyKey) => {
    let res: Response;
    try {
      res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({
          from: email.from,
          to: [email.to],
          reply_to: email.replyTo,
          subject: email.subject,
          text: email.body,
          attachments: [{ filename: email.attachmentName, content: Buffer.from(attachment).toString("base64") }],
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new Error("Could not reach the mail service");
    }
    if (!res.ok) throw new Error(`Mail service answered HTTP ${res.status}`);
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { id: typeof data.id === "string" ? data.id : "" };
  };
}
