import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { isResetTokenUsable } from "@/db/operations/password-reset";
import { ResetPasswordForm } from "@/features/password-reset/reset-password-form";
import { hashResetToken, isWellFormedResetToken } from "@/features/password-reset/token";

/* ResetPassword · Set a new password — Figma frame 70:3683 (the page the reset email opens). */

export const metadata: Metadata = { title: "Set a new password", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  // A missing, malformed, unknown, expired or used link all end on the same "link expired" screen.
  if (!isWellFormedResetToken(token) || !(await isResetTokenUsable(db, hashResetToken(token), new Date()))) {
    redirect("/reset-password/expired");
  }
  return <ResetPasswordForm token={token} />;
}
