"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { findPreferencesForUser, upsertPreferences } from "@/db/queries/preferences";
import { requireUser } from "@/lib/authorization";
import { simulateScanForTesting, pickChoiceForUser, startDayForUser, type StartDayResult } from "@/services/advisor/daily-plan";
import { removeUnavailableStopForUser } from "@/services/advisor/plan-repair";
import { INTERESTS, budgetForPriceLabel, categoriesForInterests, minutesForTimeLabel, type Interest } from "./interests";
import { isTestFinishAllowed } from "./test-finish";

/*
 * The guest's day as "choose 1 of 3". Each action only validates input and calls services/advisor/daily-plan.ts,
 * which decides everything from the guest's own stay. Errors come back as form state, never in the URL.
 */

export type PlanFormState = { error?: string; time?: string; interests?: Interest[]; price?: string };

const formSchema = z.object({
  time: z.string().refine((value) => minutesForTimeLabel(value) !== undefined, "Choose how much time you have."),
  interests: z.array(z.enum(INTERESTS)).min(1, "Pick at least one interest.").max(INTERESTS.length),
  price: z.string().refine((value) => budgetForPriceLabel(value) !== undefined, "Choose a price level."),
});

const START_MESSAGES: Record<Exclude<StartDayResult, { ok: true }>["reason"], string> = {
  no_active_stay: "You need an active hotel stay to plan your time.",
  outside_stay_period: "Your stay isn't active today, so there's nothing to plan.",
  already_started: "You've already planned today. Your new choices are saved for your next plan.",
  invalid_time: "Choose how much time you have.",
  no_preferences: "Pick at least one interest.",
  no_eligible_experiences:
    "Your hotel hasn't approved any places that match these interests. Try different interests, or browse what it offers.",
  no_plan_fits_time: "Nothing your hotel offers fits into that time, including the walk back. Try a longer time.",
  persistence_failed: "Atlas couldn't save your plan. Please try again.",
};

/** Validates the form and saves the guest's interests and price, keeping settings this form doesn't show. */
async function savePreferencesFrom(userId: string, formData: FormData): Promise<{ ok: true; minutes: number } | { ok: false; state: PlanFormState }> {
  const raw = { time: formData.get("time"), interests: formData.getAll("interests"), price: formData.get("price") };
  const parsed = formSchema.safeParse(raw);
  const echo: PlanFormState = {
    time: typeof raw.time === "string" ? raw.time : undefined,
    interests: raw.interests.filter((value): value is Interest => (INTERESTS as readonly unknown[]).includes(value)),
    price: typeof raw.price === "string" ? raw.price : undefined,
  };
  if (!parsed.success) return { ok: false, state: { ...echo, error: parsed.error.issues[0]?.message ?? "Check your choices." } };

  // Pace and distance are not on this form: keep whatever the guest already had.
  const existing = await findPreferencesForUser(userId);
  await upsertPreferences(userId, {
    categories: categoriesForInterests(parsed.data.interests),
    budget: budgetForPriceLabel(parsed.data.price) ?? null,
    activityLevel: existing?.activityLevel ?? null,
    maxDistanceMeters: existing?.maxDistanceMeters ?? null,
  });
  return { ok: true, minutes: minutesForTimeLabel(parsed.data.time)! };
}

/** "Plan my time": saves the choices, then starts today — once a day. */
export async function startPlanAction(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const user = await requireUser();
  const saved = await savePreferencesFrom(user.id, formData);
  if (!saved.ok) return saved.state;

  const result = await startDayForUser(user.id, saved.minutes);
  if (!result.ok) {
    if (result.reason === "no_active_stay" || result.reason === "outside_stay_period") redirect("/");
    return {
      time: String(formData.get("time")),
      interests: formData.getAll("interests").filter((value): value is Interest => (INTERESTS as readonly unknown[]).includes(value)),
      price: String(formData.get("price")),
      error: START_MESSAGES[result.reason],
    };
  }

  revalidatePath("/plan");
  redirect("/plan");
}

/** "Edit preferences": saves for future plans only. Today's day is left as it is. */
export async function savePreferencesAction(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const user = await requireUser();
  const saved = await savePreferencesFrom(user.id, formData);
  if (!saved.ok) return saved.state;
  revalidatePath("/plan");
  redirect("/plan?notice=saved");
}

const placeIdSchema = z.string().uuid();

/** Picks one of today's current options. The server checks it really is one of them. */
export async function pickChoiceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const placeId = placeIdSchema.safeParse(formData.get("placeId"));
  const result = placeId.success ? await pickChoiceForUser(user.id, placeId.data) : { ok: false as const, reason: "not_offered" as const };
  revalidatePath("/plan");
  // "busy": a pick is already in place (a double tap, or another tab) — show it, not an error.
  redirect(result.ok || result.reason === "busy" || result.reason === "not_choosing" ? "/plan" : "/plan?notice=pick-failed");
}

/** The picked place is no longer available through the hotel: drop it (kept as history) and choose again. */
export async function chooseAgainAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const stopId = z.string().uuid().safeParse(formData.get("stopId"));
  if (stopId.success) await removeUnavailableStopForUser({ userId: user.id, stopId: stopId.data });
  revalidatePath("/plan");
  redirect("/plan");
}

/** Test environments only: a simulated scan of the current activity — the real visit + badge unlock, no QR/location. */
export async function simulateScanAction(): Promise<void> {
  const user = await requireUser();
  if (!(await isTestFinishAllowed(user.id))) redirect("/plan");
  const result = await simulateScanForTesting(user.id);
  revalidatePath("/plan");
  redirect(result.ok ? `/plan/unlocked?stop=${result.stopId}` : "/plan");
}
