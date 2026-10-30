import "server-only";
import { db } from "@/db";
import type { CheckInMethod } from "@/db/schema";
import {
  hasVisitedPlace as hasVisitedOperation,
  listAchievementUnlocksForUser as listUnlocksOperation,
  listPlaceVisitsForUser as listVisitsOperation,
  recordVerifiedVisit as recordOperation,
  type RecordVisitResult,
} from "@/db/operations/place-visits";

/*
 * Thin bindings of the production database handle. All logic lives in
 * db/operations/place-visits.ts so the PGlite tests call the real operations.
 */

export type { RecordVisitResult };

export async function recordVerifiedVisit(input: {
  userId: string;
  placeId: string;
  method: CheckInMethod;
  now: Date;
}) {
  return recordOperation(db, input);
}

export async function listPlaceVisitsForUser(userId: string) {
  return listVisitsOperation(db, userId);
}

export async function listAchievementUnlocksForUser(userId: string) {
  return listUnlocksOperation(db, userId);
}

export async function hasVisitedPlace(userId: string, placeId: string) {
  return hasVisitedOperation(db, userId, placeId);
}
