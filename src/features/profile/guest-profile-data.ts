import "server-only";
import { findCurrentStayForUser } from "@/db/queries/hotel-stays";
import { findPreferencesForUser } from "@/db/queries/preferences";
import { findUserById } from "@/db/queries/users";
import { loadGuestAchievements } from "@/features/achievements/guest-data";
import { interestsForCategories, priceLabelFor } from "@/features/plan/interests";
import { describeStay, type GuestProfile } from "./guest-profile";

/** Everything the Profile screen shows, for the signed-in guest only. */
export async function loadGuestProfile(userId: string, now: Date = new Date()): Promise<GuestProfile> {
  const [user, stay, preferences, achievements] = await Promise.all([
    findUserById(userId),
    findCurrentStayForUser(userId),
    findPreferencesForUser(userId),
    loadGuestAchievements(userId, now),
  ]);
  const interests = interestsForCategories(preferences?.categories ?? []);
  return {
    name: user?.name ?? null,
    email: user?.email ?? "",
    stay: stay
      ? {
          hotelName: stay.place.name,
          imageUrl: stay.place.imageUrl,
          ...describeStay({ checkIn: stay.checkIn, expectedCheckOut: stay.expectedCheckOut, checkOut: stay.checkOut, now }),
        }
      : null,
    achievements: { unlocked: achievements.unlocked.length, total: achievements.total },
    interests: interests.length ? interests.join(", ") : "None chosen",
    price: priceLabelFor(preferences?.budget ?? null),
  };
}
