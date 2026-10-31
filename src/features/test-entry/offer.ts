import "server-only";
import { findActiveStayForUser } from "@/db/queries/hotel-stays";
import { findUserById } from "@/db/queries/users";
import { decideTestEntry, type TestEntryDecision } from "@/services/deployment/environment";
import { TEST_ENTRY_FIXTURES } from "@/services/deployment/test-fixtures";

/**
 * The server-side decision behind the no-QR test entry. Deliberately NOT in a "use server" file: everything exported
 * from one of those is a function a browser can call by name, and this one takes a user id and says whether that
 * account is allowlisted and whether it has a stay — information nobody should be able to ask about someone else.
 * Only server code (the guest page, and the entry action) can import this module.
 *
 * Re-evaluated from scratch on every call: environment, account and fixture are all read on the server, and the
 * account's email comes from the database row for the authenticated user id — not from the session cookie's
 * contents or a request value.
 */
export async function decideForCurrentUser(userId: string): Promise<TestEntryDecision> {
  const account = await findUserById(userId);
  return decideTestEntry({
    deploymentEnvRaw: process.env.ATLAS_DEPLOYMENT_ENV,
    accountEmail: account?.email,
    allowlistRaw: process.env.ATLAS_TEST_ENTRY_ACCOUNTS,
    fixtures: TEST_ENTRY_FIXTURES,
  });
}

/**
 * Should the home screen offer "Open the test stay"? True only for an allowlisted account in an allowed
 * non-production deployment that has no active stay. Presentation only — the entry action decides again and is what
 * enforces.
 */
export async function isTestEntryOffered(userId: string): Promise<boolean> {
  const decision = await decideForCurrentUser(userId);
  if (!decision.allowed) return false;
  return (await findActiveStayForUser(userId)) === null;
}
