import { isRedirectError } from "next/dist/client/components/redirect-error";
import { gatherAccountExport } from "@/db/queries/account-export";
import { reserveAttempt } from "@/db/queries/rate-limit";
import { handleAccountExport } from "@/features/account-export/handler";
import { requireUser } from "@/lib/authorization";

/*
 * "Download my data" on /privacy. The user is the one requireUser() resolves from the session, never an id from the
 * request. requireUser() redirects when nobody is signed in; a download must not turn into a saved login page, so
 * that redirect (and only that) becomes a 401 here. Anything else it throws is a real error and is rethrown.
 *
 * Rate limit: 5 exports per user per hour, recorded in rate_limit_attempts (scope "data_export"), so it holds across
 * every server instance. The attempt is reserved before anything is read.
 */

export const dynamic = "force-dynamic";

async function allowExport(userId: string, now: Date): Promise<boolean> {
  return (await reserveAttempt({ scope: "data_export", actorId: userId, now })).allowed;
}

async function currentUserId(): Promise<string | null> {
  try {
    const user = await requireUser();
    return user.id ?? null;
  } catch (error) {
    if (isRedirectError(error)) return null;
    throw error;
  }
}

export async function GET(): Promise<Response> {
  return handleAccountExport({ currentUserId, allowExport, gather: gatherAccountExport });
}
