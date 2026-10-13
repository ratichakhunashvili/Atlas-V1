"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hashPassword } from "@/auth/password";
import { requireUser } from "@/lib/authorization";
import { createUser, findUserByEmail } from "@/db/queries/users";
import { upsertPreferences } from "@/db/queries/preferences";
import { preferencesSchema, signupSchema } from "./schema";

export async function signupAction(formData: FormData) {
  const parsed = signupSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });

  if (!parsed.success) {
    redirect(`/signup?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }

  const existing = await findUserByEmail(parsed.data.email);
  if (existing) {
    redirect(`/signup?error=${encodeURIComponent("An account with this email already exists")}`);
  }

  const passwordHash = await hashPassword(parsed.data.password);
  // Every new account starts as "user" (the DB column default) — admin
  // status is never granted here. See db/seed.ts for the explicit, manual
  // promotion path.
  await createUser({ email: parsed.data.email, passwordHash });

  redirect("/login?registered=1");
}

export async function updatePreferencesAction(formData: FormData) {
  const user = await requireUser();

  const parsed = preferencesSchema.safeParse({
    categories: formData.getAll("categories"),
    budget: formData.get("budget") || null,
    activityLevel: formData.get("activityLevel") || null,
  });

  if (!parsed.success) {
    redirect(`/profile?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }

  await upsertPreferences(user.id, parsed.data);

  revalidatePath("/profile");
  redirect("/profile");
}
