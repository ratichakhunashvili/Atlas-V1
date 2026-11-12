"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hashPassword } from "@/auth/password";
import { db } from "@/db";
import { clientIp } from "@/lib/client-ip";
import { authRateLimitedMessage } from "@/services/rate-limit/auth-policy";
import { getMailer } from "@/services/mail";
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

/** The site's own address for the emailed link: AUTH_URL when set, otherwise the request's host. */
async function siteOrigin(): Promise<string> {
  const configured = process.env.AUTH_URL?.trim();
  if (configured) return new URL(configured).origin;
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const proto = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function requestResetAction(_previous: RequestResetState, formData: FormData): Promise<RequestResetState> {
  const email = String(formData.get("email") ?? "");
  try {
    const result = await requestPasswordReset(
      { db, mailer: getMailer(), now: new Date(), origin: await siteOrigin(), clientKey: await clientIp() },
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
