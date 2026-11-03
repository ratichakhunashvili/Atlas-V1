import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PreferencesForm } from "@/components/atlas-ui/preferences-form";
import { findPreferencesForUser } from "@/db/queries/preferences";
import { startPlanAction } from "@/features/plan/actions";
import { interestsForCategories, priceLabelFor } from "@/features/plan/interests";
import { requireUser } from "@/lib/authorization";
import { getDailyPlanForUser } from "@/services/advisor/daily-plan";

/* Preferences · Plan my time — Figma frame 1:590, on real data. Starts today's "choose 1 of 3". */

export const metadata: Metadata = { title: "Plan my time" };
export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const user = await requireUser();
  const [plan, saved] = await Promise.all([getDailyPlanForUser(user.id), findPreferencesForUser(user.id)]);

  // No valid stay: the home screen explains why. Already planned today: that plan is the place to be.
  if (plan.status === "no_stay") redirect("/");
  if (plan.status !== "not_started") redirect("/plan");

  return (
    <PreferencesForm
      mode="plan"
      hotelName={plan.hotelName}
      initial={{ time: "2 h", interests: interestsForCategories(saved?.categories ?? []), price: priceLabelFor(saved?.budget ?? null) }}
      action={startPlanAction}
    />
  );
}
