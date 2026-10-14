"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authorization";
import {
  createAdvisorTestScenario,
  deleteAdvisorTestScenario,
  findAdvisorTestScenario,
  seedPreviousDayHistory,
  type ScenarioType,
} from "@/services/advisor-testing/scenario";
import { generateItineraryForUser, type GenerateItineraryResult } from "@/services/advisor/generate-itinerary";
import { checkInStopWithGps, type CheckInResult } from "@/services/advisor/check-in";
import { checkInStopWithQr, type QrCheckInResult } from "@/services/advisor/check-in-qr";
import { setUserRole } from "@/db/queries/users";
import { scenarioTypeSchema, testUserRoleSchema, historyOutcomeSchema } from "./schema";

export type ScenarioNotFound = { ok: false; reason: "scenario_not_found"; message: string };

const SCENARIO_NOT_FOUND: ScenarioNotFound = {
  ok: false,
  reason: "scenario_not_found",
  message: "This test scenario no longer exists — it may already have been deleted.",
};

/**
 * Every action below follows the same shape: requireAdmin() authenticates
 * the ADMIN (never a bypass of any Advisor rule), resolves the scenario's
 * test userId from its tag, then calls the exact real service the guest-
 * facing flow will eventually call — generateItineraryForUser /
 * checkInStopWithGps / checkInStopWithQr. None of these services know or
 * care that the caller is an admin testing tool; they enforce ownership,
 * first-unvisited-stop, and 150m/QR-match rules exactly as they would for
 * a real guest. See services/advisor-testing/scenario.ts for how a
 * scenario's records are created/found/deleted.
 */
export async function createAdvisorTestScenarioAction(type: string, role: string): Promise<void> {
  // The admin id (used to attribute the scenario's partnership confirmations) comes from the
  // authenticated session, never from a form value. The service itself also refuses to run in production.
  const admin = await requireAdmin();

  const parsedType = scenarioTypeSchema.safeParse(type);
  const parsedRole = testUserRoleSchema.safeParse(role);
  if (!parsedType.success || !parsedRole.success) {
    redirect("/admin/advisor?error=Invalid+scenario+type+or+role");
  }

  const scenario = await createAdvisorTestScenario(parsedType.data as ScenarioType, parsedRole.data, { adminId: admin.id });
  revalidatePath("/admin/advisor");
  redirect(`/admin/advisor/${scenario.tag}`);
}

export async function deleteAdvisorTestScenarioAction(tag: string): Promise<void> {
  await requireAdmin();
  await deleteAdvisorTestScenario(tag);
  revalidatePath("/admin/advisor");
  redirect("/admin/advisor");
}

export async function promoteTestUserToAdminAction(tag: string): Promise<void> {
  await requireAdmin();
  const scenario = await findAdvisorTestScenario(tag);
  if (scenario) await setUserRole(scenario.user.email, "admin");
  revalidatePath(`/admin/advisor/${tag}`);
  redirect(`/admin/advisor/${tag}`);
}

export async function generateTestItineraryAction(tag: string): Promise<GenerateItineraryResult | ScenarioNotFound> {
  await requireAdmin();
  const scenario = await findAdvisorTestScenario(tag);
  if (!scenario) return SCENARIO_NOT_FOUND;

  return generateItineraryForUser(scenario.user.id);
}

export async function testGpsCheckInAction(
  tag: string,
  stopId: string,
  latitude: number,
  longitude: number
): Promise<CheckInResult | ScenarioNotFound> {
  await requireAdmin();
  const scenario = await findAdvisorTestScenario(tag);
  if (!scenario) return SCENARIO_NOT_FOUND;

  return checkInStopWithGps({ userId: scenario.user.id, stopId, latitude, longitude });
}

export async function testQrCheckInAction(tag: string, qrToken: string): Promise<QrCheckInResult | ScenarioNotFound> {
  await requireAdmin();
  const scenario = await findAdvisorTestScenario(tag);
  if (!scenario) return SCENARIO_NOT_FOUND;

  return checkInStopWithQr({ userId: scenario.user.id, qrToken });
}

export async function seedPreviousDayHistoryAction(tag: string, outcome: string): Promise<void> {
  await requireAdmin();
  const parsed = historyOutcomeSchema.safeParse(outcome);
  if (parsed.success) {
    await seedPreviousDayHistory(tag, parsed.data);
  }
  revalidatePath(`/admin/advisor/${tag}`);
  redirect(`/admin/advisor/${tag}`);
}
