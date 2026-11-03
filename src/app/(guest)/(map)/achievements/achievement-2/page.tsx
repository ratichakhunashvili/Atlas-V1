import type { Metadata } from "next";
import { AchievementDetailScreen } from "@/components/atlas-ui/achievement-detail";

/* AchievementDetail · Achievement details — Figma frame 1:989. */

export const metadata: Metadata = { title: "Achievement 2" };

export default function Page() {
  return <AchievementDetailScreen id="achievement-2" />;
}
