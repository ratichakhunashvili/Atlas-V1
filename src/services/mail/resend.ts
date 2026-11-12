import type { Mailer, MailMessage } from "./types";

/** Sends through Resend's REST API with plain fetch (no SDK dependency). */
export function createResendMailer(
  config: { apiKey: string; from: string },
  fetchImpl: typeof fetch = fetch
): Mailer {
  return {
    async send(message: MailMessage) {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: config.from, to: [message.to], subject: message.subject, text: message.text }),
      });
      if (!response.ok) throw new Error(`Mail provider rejected the message (HTTP ${response.status}).`);
    },
  };
}
