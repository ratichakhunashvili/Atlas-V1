export type MailMessage = { to: string; subject: string; text: string };

/** Anything that can deliver one message. Throws when delivery fails, so callers never claim success falsely. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}
