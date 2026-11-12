import { createOutboxMailer } from "./outbox";
import { createResendMailer } from "./resend";
import type { Mailer } from "./types";

export type { Mailer, MailMessage } from "./types";

type Env = Record<string, string | undefined>;

/** The outbox wins when set (so QA never emails anyone), then Resend; otherwise no mail can be sent. */
export function getMailer(env: Env = process.env): Mailer | null {
  const outbox = env.ATLAS_MAIL_OUTBOX_DIR?.trim();
  if (outbox) return createOutboxMailer(outbox);
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.MAIL_FROM?.trim();
  if (apiKey && from) return createResendMailer({ apiKey, from });
  return null;
}

export function isMailConfigured(env: Env = process.env): boolean {
  return getMailer(env) !== null;
}
