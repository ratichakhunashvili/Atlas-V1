import type { Metadata } from "next";
import { AchievementDetailScreen } from "@/components/atlas-ui/achievement-detail";

/* Achievement 4 details — built from the AchievementDetail frame (1:989); the design draws only the unlocked two. */

export const metadata: Metadata = { title: "Achievement 4" };

export default function Page() {
  return <AchievementDetailScreen id="achievement-4" />;
}
