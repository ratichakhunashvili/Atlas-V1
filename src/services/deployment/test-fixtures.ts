import { DEV_FIXTURE_EMAILS, DEV_FIXTURE_IDS } from "@/db/operations/dev-seed";

/**
 * Which seeded fixture hotel a test account may open without a QR.
 *
 * Defined in code, never from a request: the browser can neither name a hotel nor
 * add an account here. Only fictional fixtures (Atlas Test Hotel A) appear —
 * a real hotel's id can never be reached through the test-entry path.
 */
export const TEST_ENTRY_FIXTURES: Readonly<Record<string, string>> = {
  [DEV_FIXTURE_EMAILS.guest]: DEV_FIXTURE_IDS.hotelA,
};
