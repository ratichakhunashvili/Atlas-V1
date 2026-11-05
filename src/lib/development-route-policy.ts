import { developmentToolsBlocked } from "@/services/deployment/environment";

const DEVELOPMENT_ONLY_PREFIXES = ["/dev", "/demo", "/map-preview"] as const;

/**
 * Figma design-review screens that run on invented sample data ("Partner Place 1", "Hotel A", "[Achievement 1]").
 * Useful for design review on `npm run dev`; never shown to real guests, because they bypass the catalogue rule.
 * Each entry also covers the paths below it. Live screens with similar names are deliberately absent: /places/[id],
 * /plan, /plan/unlocked, /scan, /directions, /unlock/[token], /profile/*, /welcome, /privacy, /terms, the password
 * screens and /account-deleted.
 */
export const DESIGN_PREVIEW_PREFIXES = [
  "/map",
  "/route",
  "/place",
  "/list",
  "/next-stop",
  "/no-match",
  "/no-stay",
  "/qr-invalid",
  "/checked-in",
  "/ar-unlock",
  "/unlocked",
  "/stay",
  "/permissions",
  "/guide",
  "/kit",
  "/states",
  "/scan/already-checked-in",
  "/scan/camera-off",
  "/scan/not-close-enough",
  "/scan/not-in-plan",
  "/scan/place-unavailable",
  "/scan/wrong-code",
  "/plan/added-attraction-1",
  "/plan/added-partner-4",
  "/plan/added-pool",
  "/plan/added-spa",
  "/plan/build-failed",
  "/plan/building",
  "/plan/empty",
  "/plan/error",
  "/plan/ready",
  "/plan/removed",
  "/plan/reorder",
  "/plan/repair",
  "/plan/replaced",
  "/achievements/achievement-1",
  "/achievements/achievement-2",
  "/achievements/achievement-3",
  "/achievements/achievement-4",
  "/achievements/achievement-5",
] as const;

export function isDevelopmentOnlyPath(pathname: string): boolean {
  return [...DEVELOPMENT_ONLY_PREFIXES, ...DESIGN_PREVIEW_PREFIXES].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Blocked in framework production mode, and whenever ATLAS_DEPLOYMENT_ENV declares
 * anything other than local/development (see services/deployment/environment).
 */
export function shouldBlockDevelopmentOnlyPath(
  pathname: string,
  nodeEnv: string | undefined,
  deploymentEnv?: string | undefined
): boolean {
  return isDevelopmentOnlyPath(pathname) && developmentToolsBlocked(nodeEnv, deploymentEnv);
}
