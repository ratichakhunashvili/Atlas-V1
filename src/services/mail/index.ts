import { parseDeploymentEnv } from "@/services/deployment/environment";
import { createOutboxMailer } from "./outbox";
import { createResendMailer } from "./resend";
import type { Mailer } from "./types";

export type { Mailer, MailMessage } from "./types";

type Env = Record<string, string | undefined>;

/** Where a file outbox may be used: local work and QA only, never staging or production. */
const OUTBOX_ENVS = new Set(["local", "development", "qa"]);

/**
 * The outbox wins when set AND the deployment is local/development/qa (so QA never emails anyone), then Resend;
 * otherwise no mail can be sent. A stray ATLAS_MAIL_OUTBOX_DIR on staging or production is ignored, so reset links
 * can never end up on a server's disk instead of in the guest's inbox (follow-up review, 2026-11-13).
 */
export function getMailer(env: Env = process.env): Mailer | null {
  const outbox = env.ATLAS_MAIL_OUTBOX_DIR?.trim();
  const deployment = parseDeploymentEnv(env.ATLAS_DEPLOYMENT_ENV);
  if (outbox && deployment && OUTBOX_ENVS.has(deployment)) return createOutboxMailer(outbox);
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.MAIL_FROM?.trim();
  if (apiKey && from) return createResendMailer({ apiKey, from });
  return null;
}

export function isMailConfigured(env: Env = process.env): boolean {
  return getMailer(env) !== null;
}

/**
 * The trusted origin for links in emails: AUTH_URL only, never the request's Host header (which a client controls).
 * HTTPS is required; plain http is accepted only for localhost on a local/development/qa deployment. Null means links
 * cannot be built safely, so recovery reports itself unavailable.
 */
export function trustedLinkOrigin(env: Env = process.env): string | null {
  const configured = env.AUTH_URL?.trim();
  if (!configured) return null;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return null;
  }
  if (url.protocol === "https:") return url.origin;
  const deployment = parseDeploymentEnv(env.ATLAS_DEPLOYMENT_ENV);
  const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".localhost");
  if (url.protocol === "http:" && localHost && deployment && OUTBOX_ENVS.has(deployment)) return url.origin;
  return null;
}

/** Recovery works only with both a way to send mail and a trusted origin for the link. */
export function isRecoveryAvailable(env: Env = process.env): boolean {
  return isMailConfigured(env) && trustedLinkOrigin(env) !== null;
}
