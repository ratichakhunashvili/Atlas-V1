import { passwordFingerprint } from "@/lib/password-fingerprint";
import { loginSchema } from "@/features/users/schema";
import type { UserRole } from "@/db/schema";

type Account = { id: string; email: string; role: UserRole; passwordHash: string | null };

export type AuthorizeDependencies = {
  findUserByEmail: (email: string) => Promise<Account | null>;
  verifyPassword: (password: string, hash: string) => Promise<boolean>;
};

/**
 * Credential sign-in, free of Next.js so the race tests run this exact code with a pausable verifyPassword.
 *
 * bcrypt takes a moment. If the password is reset while it runs, the hash just verified is no longer the account's:
 * the account is read again afterwards and the sign-in fails unless the hash is unchanged. The token also records
 * which password it was signed in with (passwordVersion), so even a reset that commits after this re-read ends the
 * session at the next check (lib/session-standing.ts). Follow-up review, 2026-11-13.
 */
export async function authorizeCredentials(deps: AuthorizeDependencies, credentials: unknown) {
  const parsed = loginSchema.safeParse(credentials);
  if (!parsed.success) return null;

  const user = await deps.findUserByEmail(parsed.data.email);
  // An account without a password (Google only) cannot sign in with one.
  if (!user || user.passwordHash === null) return null;

  const valid = await deps.verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) return null;

  const current = await deps.findUserByEmail(parsed.data.email);
  if (!current || current.id !== user.id || current.passwordHash !== user.passwordHash) return null;

  return { id: user.id, email: user.email, role: user.role, passwordVersion: passwordFingerprint(user.passwordHash) ?? undefined, authMethod: "password" as const };
}
