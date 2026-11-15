import type { Achievement, CheckInMethod, ItineraryStop } from "@/db/schema";

/*
 * A check-in writes the stop first and the visit (and badge) second, in two transactions. If the request dies in
 * between, the stop is done but the Place still looks unvisited, and every later check-in took the "already visited"
 * shortcut without recording anything. This repairs that from the shortcut.
 *
 * The repair waits VISIT_REPAIR_GRACE_MS after the stop was written: a request that is merely still running records
 * its own visit within milliseconds, and repairing underneath it would count the arrival twice.
 */
export const VISIT_REPAIR_GRACE_MS = 30_000;

export type RecordMissingVisit = (input: {
  userId: string;
  placeId: string;
  method: CheckInMethod;
  visitedAt: Date;
}) => Promise<{ repaired: boolean; unlockedAchievement: Achievement | null }>;

/** The badge a repair just unlocked, or null. Does nothing for a stop without a Place, a fresh stop, or no repairer. */
export async function repairVisitIfMissing(
  repair: RecordMissingVisit | undefined,
  input: { userId: string; stop: Pick<ItineraryStop, "placeId" | "visitedAt">; method: CheckInMethod; now: Date }
): Promise<Achievement | null> {
  const { stop } = input;
  if (!repair || !stop.placeId || !stop.visitedAt) return null;
  if (input.now.getTime() - stop.visitedAt.getTime() < VISIT_REPAIR_GRACE_MS) return null;
  const result = await repair({ userId: input.userId, placeId: stop.placeId, method: input.method, visitedAt: stop.visitedAt });
  return result.unlockedAchievement;
}
