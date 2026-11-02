import "server-only";
import { listAchievementsForPlaces } from "@/db/queries/achievements";
import { listEarnedBadgesForUser } from "@/db/queries/places";
import { listEligibleExperiencesForGuest } from "@/services/eligibility";
import { buildGuestAchievementsView, type GuestAchievementsView } from "./guest-view";

/**
 * The signed-in guest's achievements. "Still to discover" comes only from Places the eligibility
 * service returns for the guest's own current stay: no stay (or a stay that has ended) means
 * nothing new to discover, while earned badges always stay visible.
 */
export async function loadGuestAchievements(userId: string, now: Date = new Date()): Promise<GuestAchievementsView> {
  const [earned, eligible] = await Promise.all([listEarnedBadgesForUser(userId), listEligibleExperiencesForGuest({ userId }, now)]);
  const placeNames = new Map(eligible.experiences.map((experience) => [experience.place.id, experience.place.name]));
  const badges = await listAchievementsForPlaces([...placeNames.keys()]);
  return buildGuestAchievementsView({
    earned,
    availableHere: badges.map((badge) => ({
      achievementId: badge.id,
      name: badge.name,
      placeId: badge.placeId,
      placeName: placeNames.get(badge.placeId) ?? "",
    })),
  });
}
