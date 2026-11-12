import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Mailer, MailMessage } from "./types";

/**
 * Development and QA sink: writes one JSON file per message into `directory` instead of sending
 * anything. Never used unless ATLAS_MAIL_OUTBOX_DIR is set.
 */
export function createOutboxMailer(directory: string): Mailer {
  return {
    async send(message: MailMessage) {
      await mkdir(directory, { recursive: true });
      const file = path.join(directory, `${Date.now()}-${randomUUID()}.json`);
      await writeFile(file, JSON.stringify({ ...message, sentAt: new Date().toISOString() }, null, 2), "utf8");
    },
  };
}
