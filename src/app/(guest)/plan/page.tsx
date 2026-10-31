import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DailyPlanScreen } from "@/components/atlas-ui/daily-plan";
import { isTestFinishAllowed } from "@/features/plan/test-finish";
import { requireUser } from "@/lib/authorization";
import { getDailyPlanForUser } from "@/services/advisor/daily-plan";

/*
 * MyPlan · Missions › My plan — Figma frame 1:489 — the guest's "choose 1 of 3" day, on real data.
 * Read-only: rendering this page never starts, picks or changes anything.
 */

export const metadata: Metadata = { title: "My plan" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requireUser();
  const [{ notice }, state, testFinish] = await Promise.all([searchParams, getDailyPlanForUser(user.id), isTestFinishAllowed(user.id)]);
  if (state.status === "no_stay") redirect("/");
  // Preferences come first, every day.
  if (state.status === "not_started") redirect("/preferences");
  return <DailyPlanScreen state={state} testFinish={testFinish} notice={notice} />;
}
