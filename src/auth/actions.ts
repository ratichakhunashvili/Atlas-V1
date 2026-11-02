"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { signIn, signOut } from "@/auth";
import { loginSchema } from "@/features/users/schema";
import { isAuthAttemptAllowed, recordAuthAttempt } from "@/db/queries/auth-rate-limit";
import { clientIp } from "@/lib/client-ip";
import { authRateLimitKey, authRateLimitedMessage } from "@/services/rate-limit/auth-policy";

/*
 * Sign-in for the guest screen (/login) and the admin screen (/admin/sign-in). Both use the same
 * accounts; the admin screen only changes where a successful sign-in lands. Admin access itself is
 * decided by requireAdmin() on every admin page and action, never by which form was used.
 *
 * Errors come back as form state, not in the URL, so the email a guest typed never ends up in a
 * link, a log line or the browser history.
 */

export type SignInState = { error?: string; email?: string };

/** Only same-site paths, never `//host` (protocol-relative), so a crafted link can't redirect off-site. */
function safeCallback(value: FormDataEntryValue | null, fallback: string): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export async function loginAction(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const parsed = loginSchema.safeParse({ email, password: formData.get("password") ?? "" });
  const fallback = formData.get("area") === "admin" ? "/admin" : "/";
  const redirectTo = safeCallback(formData.get("callbackUrl"), fallback);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your email and password.", email };
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

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

/** "Sign in with a different account" on Access denied, and the admin sidebar's Sign out. */
export async function adminLogoutAction() {
  await signOut({ redirectTo: "/admin/sign-in" });
}
