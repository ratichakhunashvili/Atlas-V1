import "server-only";
import { cache } from "react";
import type { Session } from "next-auth";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { User } from "@/db/schema";
import { findUserById } from "@/db/queries/users";
import { ADMIN_DENIED_PATH, ADMIN_SIGN_IN_PATH } from "./admin-route-policy";
import { SESSION_ENDED_REASON } from "./session-redirect";
import { passwordFingerprint } from "./password-fingerprint";
import { sessionStanding } from "./session-standing";
import { isSessionCookieName, signInRedirectPath } from "./sign-in-redirect";

export type CurrentSession =
  | { status: "signed-in"; user: Session["user"]; account: User }
  /** No session at all. */
  | { status: "signed-out" }
  /** A signed token whose session has been ended: signed out on another device, password reset, account deleted. */
  | { status: "ended" };

/**
 * The one server-side answer to "who is signed in", for every page, route handler and server action that gates data.
 *
 * Auth.js only proves the token is signed and unexpired. A JWT stays valid until it expires, so this also loads the
 * account row (one primary-key read, shared by everything in the same request through React's cache) and treats the
 * session as signed out when the account is gone or the token was signed in before users.sessions_valid_after.
 */
export const currentSession = cache(async (): Promise<CurrentSession> => {
  const session = await auth();
  if (!session?.user?.id) return { status: "signed-out" };
  const account = await findUserById(session.user.id);
  if (
    !account ||
    sessionStanding(
      { authTime: session.authTime, passwordVersion: session.passwordVersion },
      { sessionsValidAfter: account.sessionsValidAfter, passwordVersion: passwordFingerprint(account.passwordHash) }
    ) === "ended"
  ) {
    return { status: "ended" };
  }
  return { status: "signed-in", user: session.user, account };
});

export async function requireUser() {
  const current = await currentSession();
  if (current.status !== "signed-in") {
    const [h, c] = await Promise.all([headers(), cookies()]);
    redirect(
      signInRedirectPath({
        isServerAction: h.has("next-action"),
        referer: h.get("referer"),
        host: h.get("host"),
        hadSessionCookie: c.getAll().some((cookie) => isSessionCookieName(cookie.name)),
        ended: current.status === "ended",
      })
    );
  }
  return current.user;
}

/**
 * The platform-admin check for every admin page and every admin mutation.
 *
 * The role is read from the DATABASE row on every call (currentSession loads it with findUserById), not from the
 * Auth.js token. The token is a signed snapshot taken at sign-in and stays valid until it expires, so trusting it would
 * let an administrator who has just been demoted keep full console access — and make the staff-access screen's
 * "removed" a statement that is not true. The same read also covers an account that was deleted, and a session that was
 * ended, after the token was issued.
 */
export async function requireAdmin() {
  const current = await currentSession();
  if (current.status === "ended") redirect(`${ADMIN_SIGN_IN_PATH}?reason=${SESSION_ENDED_REASON}`);
  if (current.status !== "signed-in") redirect(ADMIN_SIGN_IN_PATH);
  const { user, account } = current;
  if (account.role !== "admin") {
    redirect(ADMIN_DENIED_PATH);
  }
  // The authoritative role, not the token's: callers that read `user.role` afterwards must see the fresh value.
  return { ...user, role: account.role };
}
