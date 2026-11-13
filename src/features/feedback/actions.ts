"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { submitPlanDayFeedback } from "@/db/queries/plan-day-feedback";
import { requireUser } from "@/lib/authorization";
import { FEEDBACK_COPY } from "./copy";
import { findDaysOwingFeedback } from "./owed";
import { parseFeedbackForm, type FeedbackFieldErrors } from "./validation";

/*
 * The private feedback form's one submit. The day id comes from the form, so it is only a claim: the server works out
 * the signed-in guest's owed days itself and stores the answers only for one of them (db/operations/plan-day-feedback.ts
 * checks ownership and "owed" again inside the transaction). A duplicate submit is treated as done, never as an error.
 */

export type FeedbackFormState = {
  error?: string;
  fieldErrors?: FeedbackFieldErrors;
  /** What the guest had entered, so a refused submit does not wipe the form. */
  values?: Record<string, string>;
};

function echo(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && /^[a-z]+_(rating|note)$/.test(key)) values[key] = value.slice(0, 2000);
  }
  return values;
}

export async function submitFeedbackAction(_prev: FeedbackFormState, formData: FormData): Promise<FeedbackFormState> {
  const user = await requireUser();
  const parsed = parseFeedbackForm(formData);
  if (!parsed.ok && parsed.reason === "invalid") {
    return { error: FEEDBACK_COPY.fixErrors, fieldErrors: parsed.fieldErrors, values: echo(formData) };
  }
  if (!parsed.ok) redirect("/feedback");

  const now = new Date();
  const { today } = await findDaysOwingFeedback(user.id, { now });
  const result = await submitPlanDayFeedback({ userId: user.id, dayId: parsed.dayId, today, answers: parsed.answers, now });

  revalidatePath("/", "layout"); // the plan and preferences screens read whether feedback is owed
  // Stored, or already stored by an earlier tap: thank the guest. Not owed: the feedback screen shows what is.
  redirect(result.ok || result.reason === "already_done" ? "/feedback?done=1" : "/feedback");
}
