import type { Metadata } from "next";
import { AdminSignInForm } from "@/components/admin/admin-sign-in-form";

/* AdminSignIn · Admin sign-in — Figma frame 70:780. */

export const metadata: Metadata = { title: "Admin sign-in · Atlas" };

export default async function AdminSignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  return <AdminSignInForm callbackUrl={callbackUrl?.startsWith("/admin") ? callbackUrl : undefined} />;
}
