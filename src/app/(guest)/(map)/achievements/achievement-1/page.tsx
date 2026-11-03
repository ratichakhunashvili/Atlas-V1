import type { Metadata } from "next";
import { AchievementDetailScreen } from "@/components/atlas-ui/achievement-detail";

/* AchievementDetailP1 · Achievement 1 details — Figma frame 1:1983. */

export const metadata: Metadata = { title: "Achievement 1" };

export default function Page() {
  return <AchievementDetailScreen id="achievement-1" />;
}
