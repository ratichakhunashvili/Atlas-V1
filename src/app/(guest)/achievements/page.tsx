import type { Metadata } from "next";
import { AchievementsScreen } from "@/components/atlas-ui/achievements";

/* Achievements · Profile › Achievements — Figma frame 1:624. */

export const metadata: Metadata = { title: "Achievements" };

export default function AchievementsPage() {
  return <AchievementsScreen />;
}
