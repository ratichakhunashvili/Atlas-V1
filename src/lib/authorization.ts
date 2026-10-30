import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { findUserById } from "@/db/queries/users";

export async function requireUser() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session.user;
}

/**
 * The platform-admin check for every admin page and every admin mutation.
 *
 * The role is read from the DATABASE on every call, not from the Auth.js token. The token is a signed snapshot taken
 * at sign-in and stays valid until it expires, so trusting it would let an administrator who has just been demoted
 * keep full console access — and make the staff-access screen's "removed" a statement that is not true. One indexed
 * primary-key read per admin request is the price of "a fresh server-side role check", which the admin specification
 * requires, and it also covers an account that was deleted after the token was issued.
 */
export async function requireAdmin() {
  const user = await requireUser();
  const current = await findUserById(user.id);
  if (!current || current.role !== "admin") {
    redirect("/");
  }
  // The authoritative role, not the token's: callers that read `user.role` afterwards must see the fresh value.
  return { ...user, role: current.role };
}
