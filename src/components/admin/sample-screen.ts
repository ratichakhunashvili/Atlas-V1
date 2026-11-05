import "server-only";
import { redirect } from "next/navigation";
import { developmentToolsBlocked } from "@/services/deployment/environment";

/**
 * The Figma admin screens built on sample data (forms that save nothing, a QR list of made-up codes) stay
 * available as a design reference where development tools are allowed. Everywhere else the address sends
 * the admin to the real screen that does the job, so a sample button can never be mistaken for a real one.
 */
export function sampleScreenOrRedirect(realPath: string): void {
  if (developmentToolsBlocked(process.env.NODE_ENV, process.env.ATLAS_DEPLOYMENT_ENV)) redirect(realPath);
}
