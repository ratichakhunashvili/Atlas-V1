import type { CurrentSession } from "@/lib/authorization";
import { isPasswordSession } from "@/lib/session-standing";

/**
 * Who may even ask the model-upload route for anything, decided BEFORE the route says whether storage is configured:
 * a deployment detail is for admins only. Signed out (or an ended session) is 401, any other account is 403, and only
 * then does a missing store answer 503. Returns null when the request may go on.
 */
export type UploadRefusal = { status: 401 | 403 | 503; error: string };

export function modelUploadRefusal(session: CurrentSession, blobConfigured: boolean): UploadRefusal | null {
  if (session.status !== "signed-in") return { status: 401, error: "Sign in as an administrator to upload models." };
  // A Google session never has admin access, even on an admin account (lib/authorization.ts requireAdmin).
  if (session.account.role !== "admin" || !isPasswordSession(session.authMethod)) return { status: 403, error: "Only administrators can upload models." };
  if (!blobConfigured) return { status: 503, error: "File storage isn't configured for this deployment." };
  return null;
}
