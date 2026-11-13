"use server";

import { redirect } from "next/navigation";
import { hashPassword } from "@/auth/password";
import { db } from "@/db";
import { clientIp } from "@/lib/client-ip";
import { authRateLimitedMessage } from "@/services/rate-limit/auth-policy";
import { getMailer, trustedLinkOrigin } from "@/services/mail";
import { completePasswordReset, GENERIC_SENT_MESSAGE, requestPasswordReset } from "./core";

/*
 * Forgot password and Reset password. Results come back as form state, never in the URL, so
 * nothing about the visitor or the outcome is left in a link or the browser history.
 */

export type RequestResetState = {
  status: "idle" | "sent" | "unavailable" | "error";
  message?: string;
  email?: string;
};


export async function requestResetAction(_previous: RequestResetState, formData: FormData): Promise<RequestResetState> {
  const email = String(formData.get("email") ?? "");
  try {
    // The link's origin is AUTH_URL only (services/mail trustedLinkOrigin), never the request's Host header.
    const origin = trustedLinkOrigin();
    const result = await requestPasswordReset(
      { db, mailer: origin ? getMailer() : null, now: new Date(), origin: origin ?? "", clientKey: await clientIp() },
      email
    );
    switch (result.status) {
      case "sent":
        return { status: "sent", message: GENERIC_SENT_MESSAGE };
      case "unavailable":
        return { status: "unavailable", email };
      case "rate_limited":
        return { status: "error", message: authRateLimitedMessage(), email };
      case "invalid":
        return { status: "error", message: result.error, email };
    }
  } catch (error) {
    console.error("Password reset request failed", error instanceof Error ? error.message : error);
    return { status: "error", message: "Atlas can't do that right now. Please try again in a moment.", email };
  }
}

export type ResetPasswordState = {
  status: "idle" | "done" | "error";
  formError?: string;
  fieldErrors?: { password?: string; confirm?: string };
};

export async function resetPasswordAction(_previous: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  let result;
  try {
    result = await completePasswordReset(
      { db, hashPassword, now: new Date() },
      {
        token: formData.get("token"),
        password: String(formData.get("password") ?? ""),
        confirm: String(formData.get("confirm") ?? ""),
      }
    );
  } catch (error) {
    console.error("Password reset failed", error instanceof Error ? error.message : error);
    return { status: "error", formError: "Atlas can't change your password right now. Please try again in a moment." };
  }
  if (result.status === "invalid_token") redirect("/reset-password/expired");
  if (result.status === "invalid") return { status: "error", fieldErrors: result.fieldErrors };
  return { status: "done" };
}
