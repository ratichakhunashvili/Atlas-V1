/**
 * What a guest's Achievements screen shows, from their own data.
 *
 * - Unlocked: every badge this guest has earned, at any hotel. Badges are kept after a stay ends.
 * - Still to discover: badges at Places eligible for the guest's CURRENT hotel that they have not
 *   earned yet. Eligibility is decided by the caller through the eligibility service, never here,
 *   so this can't list a Place the hotel has not approved.
 *
 * Pure, so the rules are tested without a database.
 */

export type EarnedBadge = { achievementId: string; name: string; placeName: string; unlockedAt: Date; method: string };
export type AvailableBadge = { achievementId: string; name: string; placeId: string; placeName: string };

export type GuestAchievementsView = {
  unlocked: EarnedBadge[];
  locked: AvailableBadge[];
  /** Unlocked plus still to discover; what "X of Y" counts against. */
  total: number;
};

export function buildGuestAchievementsView(input: { earned: EarnedBadge[]; availableHere: AvailableBadge[] }): GuestAchievementsView {
  const earnedIds = new Set(input.earned.map((badge) => badge.achievementId));
  const unlocked = [...input.earned].sort((a, b) => b.unlockedAt.getTime() - a.unlockedAt.getTime());
  const locked = input.availableHere
    .filter((badge) => !earnedIds.has(badge.achievementId))
    .sort((a, b) => a.placeName.localeCompare(b.placeName));
  return { unlocked, locked, total: unlocked.length + locked.length };
}
