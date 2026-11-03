import type { Metadata } from "next";
import { MyPlanScreen } from "@/components/atlas-ui/my-plan";

/*
 * MyPlanEmpty · Missions › My plan (empty) — Figma frame 1:1195. Before any plan exists.
 *
 * A design-review route: it opens this state and seeds the demo plan with it (demo/scenarios.ts).
 */

export const metadata: Metadata = { title: "My plan, empty" };

export default function Page() {
  return <MyPlanScreen scenario="empty" />;
}
