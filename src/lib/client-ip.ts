import "server-only";
import { headers } from "next/headers";

/**
 * The visitor's network address, used only as a rate-limit key (and then only as a hash).
 *
 * On Vercel the platform sets `x-forwarded-for` and puts the real client first. Locally there may
 * be no header at all; then every attempt shares the "unknown" key, which only makes local testing
 * stricter, never looser.
 */
export async function clientIp(): Promise<string> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || list.get("x-real-ip")?.trim() || "unknown";
}
