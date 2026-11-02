import type { Metadata } from "next";
import { AchievementsScreen } from "@/components/atlas-ui/achievements";
import { loadGuestAchievements } from "@/features/achievements/guest-data";
import { requireUser } from "@/lib/authorization";

/* Achievements · Profile › Achievements — Figma frame 1:624, with the signed-in guest's own badges. */

export const metadata: Metadata = { title: "Achievements" };

export default async function AchievementsPage() {
  const user = await requireUser();
  return <AchievementsScreen view={await loadGuestAchievements(user.id)} />;
}
