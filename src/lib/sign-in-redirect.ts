import { safeCallback } from "@/auth/callback";
import { SESSION_ENDED_REASON } from "./session-redirect";

/*
 * Where requireUser() sends someone it cannot serve. Pages are normally caught earlier by the proxy, which knows the
 * path. A server action (a form submit, the Next-Action header) is not: the proxy deliberately lets POSTs through, so
 * here the page the form was on comes from the same-site Referer, and a session cookie that no longer works earns the
 * "Your session ended" message. Pure, so it is tested without Next.js.
 */
export function signInRedirectPath(input: {
  isServerAction: boolean;
  referer: string | null;
  host: string | null;
  hadSessionCookie: boolean;
  ended: boolean;
}): string {
  const params = new URLSearchParams();
  if (input.isServerAction && input.referer && input.host) {
    try {
      const from = new URL(input.referer);
      const target = from.pathname + from.search;
      if (from.host === input.host && safeCallback(target, "") === target && target !== "/login") params.set("callbackUrl", target);
    } catch {
      // An unparseable Referer just means no return path.
    }
  }
  if (input.ended || input.hadSessionCookie) params.set("reason", SESSION_ENDED_REASON);
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

/** Auth.js session cookie names, plain and __Secure- prefixed, including chunked variants. */
export function isSessionCookieName(name: string): boolean {
  return /^(__Secure-)?authjs\.session-token(\.\d+)?$/.test(name);
}
