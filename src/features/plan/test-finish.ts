import "server-only";
import { findUserById } from "@/db/queries/users";
import { isTestEntryEnvironment, parseDeploymentEnv, parseTestAccountAllowlist } from "@/services/deployment/environment";

/*
 * Whether this account may use the TEMPORARY "I've finished this" button, which marks the current activity done
 * without a real check-in. It exists only until real QR/GPS check-in is connected to the daily plan.
 *
 * Same gate as the test stay: an allowed non-production deployment (ATLAS_DEPLOYMENT_ENV) AND an account on the
 * ATLAS_TEST_ENTRY_ACCOUNTS allowlist, whose email is read from the database for the authenticated id. Unset or
 * production -> never. Deliberately not a "use server" file, so a browser cannot ask about another account.
 */
export async function isTestFinishAllowed(userId: string): Promise<boolean> {
  if (!isTestEntryEnvironment(parseDeploymentEnv(process.env.ATLAS_DEPLOYMENT_ENV))) return false;
  const account = await findUserById(userId);
  const email = account?.email?.trim().toLowerCase();
  return Boolean(email && parseTestAccountAllowlist(process.env.ATLAS_TEST_ENTRY_ACCOUNTS).has(email));
}
