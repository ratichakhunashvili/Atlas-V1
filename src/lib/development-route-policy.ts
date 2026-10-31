import { developmentToolsBlocked } from "@/services/deployment/environment";

const DEVELOPMENT_ONLY_PREFIXES = ["/dev", "/demo", "/map-preview"] as const;

export function isDevelopmentOnlyPath(pathname: string): boolean {
  return DEVELOPMENT_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
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
