import type { Metadata } from "next";
import { MyPlanScreen } from "@/components/atlas-ui/my-plan";

/*
 * MyPlanAddedSpa · My plan with the spa added — Figma frame 1:2378.
 *
 * A design-review route: it opens this state and seeds the demo plan with it (demo/scenarios.ts).
 */

export const metadata: Metadata = { title: "My plan, spa added" };

export default function Page() {
  return <MyPlanScreen scenario="addedSpa" />;
}
