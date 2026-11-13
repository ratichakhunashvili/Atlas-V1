"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { signIn, signOut } from "@/auth";
import { revokeUserSessions } from "@/db/queries/users";
import { currentSession } from "@/lib/authorization";
import { loginSchema } from "@/features/users/schema";
import { isAuthAttemptAllowed, recordAuthAttempt } from "@/db/queries/auth-rate-limit";
import { clientIp } from "@/lib/client-ip";
import { authRateLimitKey, authRateLimitedMessage } from "@/services/rate-limit/auth-policy";
import { safeCallback } from "./callback";
import { isGoogleSignInConfigured } from "./google";
import { redirect } from "next/navigation";

/*
 * Sign-in for the guest screen (/login) and the admin screen (/admin/sign-in). Both use the same
 * accounts; the admin screen only changes where a successful sign-in lands. Admin access itself is
 * decided by requireAdmin() on every admin page and action, never by which form was used.
 *
 * Errors come back as form state, not in the URL, so the email a guest typed never ends up in a
 * link, a log line or the browser history.
 */

export type SignInState = { error?: string; email?: string; fieldErrors?: { email?: string; password?: string } };

export async function loginAction(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const parsed = loginSchema.safeParse({ email, password: formData.get("password") ?? "" });
  const fallback = formData.get("area") === "admin" ? "/admin" : "/";
  const redirectTo = safeCallback(formData.get("callbackUrl"), fallback);

  if (!parsed.success) {
    // Per-field messages, so a blank or malformed field is explained next to it like on the sign-up screen.
    const fieldErrors: NonNullable<SignInState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === "email" || field === "password") fieldErrors[field] ??= issue.message;
    }
    // `error` stays set for the admin screen, which shows one message; the guest screen shows the field messages.
    return { error: parsed.error.issues[0]?.message ?? "Check your email and password.", fieldErrors, email };
  }

  // Checked before the password, so a throttled email can't keep testing passwords. Only failures
  // are recorded: a guest who signs in correctly is never slowed down.
  const now = new Date();
  const emailKey = authRateLimitKey("email", parsed.data.email);
  const ipKey = authRateLimitKey("ip", await clientIp());
  const [emailAllowed, ipAllowed] = await Promise.all([
    isAuthAttemptAllowed({ scope: "sign_in_email", keyHash: emailKey, now }),
    isAuthAttemptAllowed({ scope: "sign_in_ip", keyHash: ipKey, now }),
  ]);
  if (!emailAllowed || !ipAllowed) return { error: authRateLimitedMessage(), email };

  try {
    await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirectTo });
  } catch (err) {
    // signIn() redirects by throwing, so only Auth.js errors become messages. A wrong email or
    // password is CredentialsSignin; anything else (the database is unreachable, say) must not be
    // reported as a wrong password.
    if (err instanceof CredentialsSignin) {
      await Promise.all([
        recordAuthAttempt({ scope: "sign_in_email", keyHash: emailKey, now }),
        recordAuthAttempt({ scope: "sign_in_ip", keyHash: ipKey, now }),
      ]);
      return { error: "Email or password is incorrect.", email };
    }
    if (err instanceof AuthError) {
      console.error("Sign-in failed", err.type);
      return { error: "Atlas can't sign you in right now. Please try again in a moment.", email };
    }
    throw err;
  }
  return {};
}

/**
 * "Continue with Google" on the sign-in and sign-up screens. Auth.js answers with a redirect to Google; the account
 * rules run when Google sends the guest back (auth/index.ts). The destination is the same safe same-site path as a
 * password sign-in, so a hotel code scanned before signing in survives the trip to Google. Without the Google keys
 * there is no provider and no button; a stray post just returns to the sign-in screen.
 */
export async function googleSignInAction(formData: FormData) {
  const redirectTo = safeCallback(formData.get("callbackUrl"), "/");
  if (!isGoogleSignInConfigured(process.env)) redirect("/login");
  await signIn("google", { redirectTo });
}

/**
 * Ends the account's sessions on ALL devices, not only this browser's. Clearing the cookie alone is not enough: an
 * Auth.js JWT stays valid until it expires, so a copy of it (another device, or a cookie the browser failed to drop)
 * would keep working. sessions_valid_after = now makes the server refuse every token signed in before this moment
 * (lib/session-standing.ts). It runs BEFORE signOut, which ends the request with a redirect.
 *
 * Only a session that is still valid can end the others: a stale token whose session was already ended (say a phone
 * left signed out) must not sign the guest out of the laptop they signed in on since.
 */
async function endSessionsOfSignedInAccount() {
  const session = await currentSession();
  if (session.status === "signed-in") await revokeUserSessions(session.user.id, new Date());
}

export async function logoutAction() {
  await endSessionsOfSignedInAccount();
  await signOut({ redirectTo: "/login" });
}

/** "Sign in with a different account" on Access denied, and the admin sidebar's Sign out. Same all-devices rule. */
export async function adminLogoutAction() {
  await endSessionsOfSignedInAccount();
  await signOut({ redirectTo: "/admin/sign-in" });
}
