/**
 * Which Atlas deployment is this? Read from ATLAS_DEPLOYMENT_ENV, never from
 * NODE_ENV alone: QA and staging deployments run Next.js in production mode, so
 * NODE_ENV cannot tell "staging" from "production".
 *
 * Pure on purpose — the raw value is passed in, so every branch is testable and
 * nothing here can quietly read the wrong variable.
 */
export const DEPLOYMENT_ENVS = ["local", "development", "qa", "staging", "production"] as const;
export type DeploymentEnv = (typeof DEPLOYMENT_ENVS)[number];

/** Exact (case-insensitive, trimmed) match or null. A typo is "unknown", never "probably local". */
export function parseDeploymentEnv(raw: string | undefined | null): DeploymentEnv | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  return (DEPLOYMENT_ENVS as readonly string[]).includes(value) ? (value as DeploymentEnv) : null;
}

/** Environments where an allowlisted test account may skip the hotel QR. Production is never in this list. */
const TEST_ENTRY_ENVS: readonly DeploymentEnv[] = ["local", "development", "qa", "staging"];

export function isTestEntryEnvironment(env: DeploymentEnv | null): boolean {
  return env !== null && TEST_ENTRY_ENVS.includes(env);
}

/**
 * Parses ATLAS_TEST_ENTRY_ACCOUNTS: a comma-separated list of account emails.
 * Empty or missing means nobody is allowlisted.
 */
export function parseTestAccountAllowlist(raw: string | undefined | null): ReadonlySet<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0)
  );
}

export type TestEntryDenial =
  | "environment_not_allowed" // missing, unknown or production
  | "account_not_allowlisted"
  | "no_fixture_for_account";

export type TestEntryDecision =
  | { allowed: true; hotelId: string }
  | { allowed: false; reason: TestEntryDenial };

/**
 * Whether this account may open a seeded test stay without scanning a hotel QR.
 *
 * Three independent server-side conditions, ALL required, evaluated on every
 * request: a recognised non-production deployment, an allowlisted account, and a
 * fixture hotel mapped to that account in code. Nothing from the browser takes
 * part — in particular no hotel id: the hotel comes only from `fixtures`.
 */
export function decideTestEntry(input: {
  deploymentEnvRaw: string | undefined | null;
  accountEmail: string | null | undefined;
  allowlistRaw: string | undefined | null;
  /** Lower-case account email -> fixture hotel id. Defined in code, not by a request. */
  fixtures: Readonly<Record<string, string>>;
}): TestEntryDecision {
  if (!isTestEntryEnvironment(parseDeploymentEnv(input.deploymentEnvRaw))) {
    return { allowed: false, reason: "environment_not_allowed" };
  }

  const email = input.accountEmail?.trim().toLowerCase();
  if (!email || !parseTestAccountAllowlist(input.allowlistRaw).has(email)) {
    return { allowed: false, reason: "account_not_allowlisted" };
  }

  const hotelId = Object.hasOwn(input.fixtures, email) ? input.fixtures[email] : undefined;
  if (!hotelId) {
    return { allowed: false, reason: "no_fixture_for_account" };
  }

  return { allowed: true, hotelId };
}

/**
 * Development-only routes (/dev, /demo, /map-preview).
 *
 * Blocked whenever the app is in framework production mode, or whenever a
 * deployment environment is declared and is not local/development. Plain
 * `next dev` with nothing set stays usable, because that is local work; a
 * declared "qa"/"staging"/"production" never exposes them.
 */
export function developmentToolsBlocked(nodeEnv: string | undefined, deploymentEnvRaw: string | undefined | null): boolean {
  if (nodeEnv === "production") return true;
  if (deploymentEnvRaw === undefined || deploymentEnvRaw === null || deploymentEnvRaw.trim() === "") return false;
  const env = parseDeploymentEnv(deploymentEnvRaw);
  return env !== "local" && env !== "development"; // unknown values block too
}
