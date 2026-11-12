import type { Metadata } from "next";
import { AdminSignInForm } from "@/components/admin/admin-sign-in-form";
import { SESSION_ENDED_REASON } from "@/lib/session-redirect";

/* AdminSignIn · Admin sign-in — Figma frame 70:780. */

export const metadata: Metadata = { title: "Admin sign-in · Atlas" };

export default async function AdminSignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; reason?: string }> }) {
  const { callbackUrl, reason } = await searchParams;
  // Console destinations only, path and query (/admin/analytics?days=7); loginAction sanitises it again.
  const adminCallback = typeof callbackUrl === "string" && /^\/admin(?:[/?]|$)/.test(callbackUrl) ? callbackUrl : undefined;
  return <AdminSignInForm callbackUrl={adminCallback} sessionEnded={reason === SESSION_ENDED_REASON} />;
}
