"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { signIn } from "@/auth";
import { hashPassword } from "@/auth/password";
import { hasPgErrorCode, PG_UNIQUE_VIOLATION } from "@/db/errors";
import { requireUser } from "@/lib/authorization";
import { createUser, findUserByEmail } from "@/db/queries/users";
import { upsertPreferences } from "@/db/queries/preferences";
import { preferencesSchema, signupSchema } from "./schema";

/**
 * Create account (Figma SignUp, SignUpEmailUsed, SignUpWeak). Problems come back as form state —
 * with the typed name and email, never the password — so the screen can show the design's error
 * states without putting anything personal in the URL.
 */
export type SignUpField = "name" | "email" | "password";
export type SignUpState = {
  emailUsed?: boolean;
  fieldErrors?: Partial<Record<SignUpField, string>>;
  values?: { name: string; email: string };
};

export async function signupAction(_previous: SignUpState, formData: FormData): Promise<SignUpState> {
  const values = { name: String(formData.get("name") ?? ""), email: String(formData.get("email") ?? "") };
  const password = String(formData.get("password") ?? "");
  const parsed = signupSchema.safeParse({ ...values, password });

  if (!parsed.success) {
    const fieldErrors: SignUpState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as SignUpField;
      fieldErrors[field] ??= issue.message;
    }
    return { fieldErrors, values };
  }

  const emailUsed: SignUpState = {
    emailUsed: true,
    fieldErrors: { email: "This email is already in use." },
    values,
  };
  if (await findUserByEmail(parsed.data.email)) return emailUsed;

  const passwordHash = await hashPassword(parsed.data.password);
  // Every new account starts as "user" (the DB column default) — admin
  // status is never granted here. See db/seed.ts for the explicit, manual
  // promotion path.
  try {
    await createUser({ email: parsed.data.email, passwordHash, name: parsed.data.name });
  } catch (error) {
    // Two sign-ups for the same email at once: the unique index decides, and the loser sees the same message.
    if (hasPgErrorCode(error, PG_UNIQUE_VIOLATION)) return emailUsed;
    throw error;
  }

  // Signed straight in, as the design continues from Create account into the app.
  await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirectTo: "/" });
  return {};
}

export async function updatePreferencesAction(formData: FormData) {
  const user = await requireUser();

  const parsed = preferencesSchema.safeParse({
    categories: formData.getAll("categories"),
    budget: formData.get("budget") || null,
    activityLevel: formData.get("activityLevel") || null,
    maxDistanceMeters: formData.get("maxDistanceMeters") || null,
  });

  if (!parsed.success) {
    redirect(`/profile?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }

  await upsertPreferences(user.id, parsed.data);

  revalidatePath("/profile");
  // The Advisor plans from these, so the pages that use them must not serve a stale copy.
  revalidatePath("/");
  revalidatePath("/experiences");
  redirect("/profile?saved=1");
}
