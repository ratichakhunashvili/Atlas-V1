import type { UserRole } from "@/db/schema";
import type { GoogleSignInRefusal } from "@/db/operations/google-sign-in";
import { passwordFingerprint } from "@/lib/password-fingerprint";

/*
 * Google sign-in glue (Phase 3) that needs neither Next.js nor a database, so the tests run it directly. The account
 * rules themselves live in db/operations/google-sign-in.ts; auth/index.ts wires both into Auth.js.
 */

/** Google sign-in exists only when BOTH keys are set (in Vercel, never in the repo). Otherwise no provider, no button. */
export function isGoogleSignInConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(env.AUTH_GOOGLE_ID?.trim() && env.AUTH_GOOGLE_SECRET?.trim());
}

/** How a session was signed in. Admin access requires "password" (lib/authorization.ts requireAdmin). */
export type AuthMethod = "password" | "google";

/**
 * The user Auth.js puts in the token after a Google sign-in. Without a database adapter Auth.js would use Google's own
 * id as the user id; this swaps in the Atlas account the sign-in callback just resolved, read again by the Google id.
 * Null (no linked account, or an admin account) ends the sign-in.
 */
export async function googleSessionUser(
  findLinkedAccount: (sub: string) => Promise<{ id: string; email: string; role: UserRole; passwordHash: string | null } | null>,
  sub: string
) {
  const account = await findLinkedAccount(sub);
  if (!account || account.role === "admin") return null;
  return {
    id: account.id,
    email: account.email,
    role: account.role,
    passwordVersion: passwordFingerprint(account.passwordHash) ?? undefined,
    authMethod: "google" as const,
  };
}

/*
 * Errors reach /login as a short code in ?error=, never an email or anything else personal. Auth.js's own codes
 * (AccessDenied, OAuthCallbackError, Configuration, …) and anything unknown get the general message.
 */
const REFUSAL_CODES: Record<GoogleSignInRefusal, string> = {
  invalid_profile: "google",
  email_unverified: "google_unverified",
  admin_account: "google_admin",
  other_google_account: "google_other_account",
};

export function googleRefusalPath(reason: GoogleSignInRefusal): string {
  return `/login?error=${REFUSAL_CODES[reason]}`;
}

const MESSAGES: Record<string, string> = {
  google_unverified: "Your Google account's email isn't verified yet, so Atlas can't use it. Verify it with Google, or sign in with your email and password.",
  google_admin: "Admin accounts sign in with email and password.",
  google_other_account: "This Atlas account is already connected to a different Google account. Continue with that one, or sign in with your email and password.",
};
const GENERAL = "Google sign-in didn't work. Please try again, or sign in with your email and password.";

/** The message for an ?error= code on the sign-in screen, or null when there is no error. */
export function signInErrorMessage(code: unknown): string | null {
  if (typeof code !== "string" || code === "") return null;
  return MESSAGES[code] ?? GENERAL;
}
