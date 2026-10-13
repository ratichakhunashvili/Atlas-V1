"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { loginSchema } from "@/features/users/schema";

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });

  const callbackUrl = formData.get("callbackUrl");
  const redirectTo =
    typeof callbackUrl === "string" && callbackUrl.startsWith("/") ? callbackUrl : "/";

  if (!parsed.success) {
    redirect(`/login?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      redirect(`/login?error=${encodeURIComponent("Invalid email or password")}`);
    }
    throw err;
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
