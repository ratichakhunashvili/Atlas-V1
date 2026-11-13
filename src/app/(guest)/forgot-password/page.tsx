import type { Metadata } from "next";
import { ForgotPasswordForm, RecoveryUnavailable } from "@/features/password-reset/forgot-password-form";
import { isRecoveryAvailable } from "@/services/mail";

/* ForgotPassword · Reset password — Figma frame 1:1271. */

export const metadata: Metadata = { title: "Reset your password" };

// Whether mail is configured is a runtime fact, so this page is never prerendered.
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return isRecoveryAvailable() ? <ForgotPasswordForm /> : <RecoveryUnavailable />;
}
