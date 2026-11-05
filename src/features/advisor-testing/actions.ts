"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authorization";
import {
  createAdvisorTestScenario,
  deleteAdvisorTestScenario,
  findAdvisorTestScenario,
  isSafeScenarioTag,
  seedPreviousDayHistory,
  type ScenarioType,
} from "@/services/advisor-testing/scenario";
import { generateItineraryForUser, type GenerateItineraryResult } from "@/services/advisor/generate-itinerary";
import { checkInStopWithGps, type CheckInResult } from "@/services/advisor/check-in";
import { checkInStopWithQr, type QrCheckInResult } from "@/services/advisor/check-in-qr";
import { findActiveQrCredentialForPlace, issueQrCredential } from "@/db/queries/qr-credentials";
import { generateRawQrToken, hashQrToken } from "@/services/qr";
import { setUserRole } from "@/db/queries/users";
import { recordAdminAudit } from "@/db/queries/admin-audit";
import { developmentToolsBlocked } from "@/services/deployment/environment";
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
/** Scenario tools write real rows, so they only run where development tools are allowed (never on the live site). */
function refuseOutsideDevelopment(): void {
  if (developmentToolsBlocked(process.env.NODE_ENV, process.env.ATLAS_DEPLOYMENT_ENV)) {
    redirect(`/admin/advisor?error=${encodeURIComponent("Advisor testing is turned off on this deployment.")}`);
  }
}

/** A scenario's page. The tag is checked against its fixed shape, so it can't steer a redirect anywhere else. */
function scenarioPath(tag: string): string {
  return isSafeScenarioTag(tag) ? `/admin/advisor/${tag}` : "/admin/advisor";
}

export async function createAdvisorTestScenarioAction(type: string, role: string): Promise<void> {
  // The admin id (used to attribute the scenario's partnership confirmations) comes from the
  // authenticated session, never from a form value. The service itself also refuses to run in production.
  const admin = await requireAdmin();
  refuseOutsideDevelopment();

  const parsedType = scenarioTypeSchema.safeParse(type);
  const parsedRole = testUserRoleSchema.safeParse(role);
  if (!parsedType.success || !parsedRole.success) {
    redirect(`/admin/advisor?error=${encodeURIComponent("Choose a valid scenario type and role.")}`);
  }

  const scenario = await createAdvisorTestScenario(parsedType.data as ScenarioType, parsedRole.data, { adminId: admin.id });
  revalidatePath("/admin/advisor");
  redirect(`/admin/advisor/${scenario.tag}`);
}

export async function deleteAdvisorTestScenarioAction(tag: string): Promise<void> {
  await requireAdmin();
  refuseOutsideDevelopment();
  if (!isSafeScenarioTag(tag)) redirect("/admin/advisor");
  await deleteAdvisorTestScenario(tag);
  revalidatePath("/admin/advisor");
  redirect("/admin/advisor");
}

export async function promoteTestUserToAdminAction(tag: string): Promise<void> {
  const admin = await requireAdmin();
  refuseOutsideDevelopment();
  const scenario = isSafeScenarioTag(tag) ? await findAdvisorTestScenario(tag) : null;
  if (scenario && scenario.user.role !== "admin") {
    await setUserRole(scenario.user.email, "admin");
    // Granting admin is always audited, even to a throwaway test account.
    await recordAdminAudit({
      actorUserId: admin.id,
      action: "staff.role_changed",
      targetType: "user",
      targetId: scenario.user.id,
      before: { role: scenario.user.role },
      after: { role: "admin" },
      reason: `advisor test scenario ${tag}`,
    });
  }
  revalidatePath(scenarioPath(tag));
  redirect(scenarioPath(tag));
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

  // The scenario tool supplies evidence that passes the server's limits (a precise
  // fix, taken now) so that it exercises the ordinary path. It does not bypass the
  // rules: the same validation runs, against the same server clock.
  return checkInStopWithGps({
    userId: scenario.user.id,
    stopId,
    latitude,
    longitude,
    accuracyMeters: 10,
    capturedAtMs: Date.now(),
  });
}

export async function testQrCheckInAction(tag: string, qrToken: string): Promise<QrCheckInResult | ScenarioNotFound> {
  await requireAdmin();
  const scenario = await findAdvisorTestScenario(tag);
  if (!scenario) return SCENARIO_NOT_FOUND;

  return checkInStopWithQr({ userId: scenario.user.id, qrToken });
}

/**
 * Runs the scenario's real Place QR check-in without any secret reaching the browser.
 *
 * Stored credentials are hashes, so no raw token can be recovered to replay here.
 * Instead this ROTATES the Place's credential — issuing a fresh one, which revokes
 * the previous — and uses that value in-process for exactly one scan. The raw token
 * never leaves this function, and the path exercised is the real one: hash, lookup,
 * purpose, revocation and expiry checks included.
 */
export async function testScenarioQrCheckInAction(
  tag: string,
  placeId: string
): Promise<QrCheckInResult | ScenarioNotFound> {
  const admin = await requireAdmin();
  const scenario = await findAdvisorTestScenario(tag);
  if (!scenario) return SCENARIO_NOT_FOUND;

  const place = scenario.places.find((candidate) => candidate.id === placeId);
  if (!place) {
    return {
      ok: false,
      reason: "invalid_qr",
      message: "That Place is not part of this test scenario.",
    };
  }

  const existing = await findActiveQrCredentialForPlace(place.id);
  if (!existing) {
    return {
      ok: false,
      reason: "invalid_qr",
      message: "That Place does not have a QR code in this test scenario.",
    };
  }

  const rawToken = generateRawQrToken();
  await issueQrCredential({
    purpose: "place_check_in",
    placeId: place.id,
    tokenHash: hashQrToken(rawToken),
    createdByUserId: admin.id,
  });

  return checkInStopWithQr({ userId: scenario.user.id, qrToken: rawToken });
}

export async function seedPreviousDayHistoryAction(tag: string, outcome: string): Promise<void> {
  await requireAdmin();
  refuseOutsideDevelopment();
  const parsed = historyOutcomeSchema.safeParse(outcome);
  if (parsed.success) {
    await seedPreviousDayHistory(tag, parsed.data);
  }
  revalidatePath(scenarioPath(tag));
  redirect(scenarioPath(tag));
}
