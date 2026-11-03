import type { Metadata } from "next";
import { MyPlanScreen } from "@/components/atlas-ui/my-plan";

/*
 * MyPlanAddedA1 · My plan with Attraction 1 added — Figma frame 1:2620.
 *
 * A design-review route: it opens this state and seeds the demo plan with it (demo/scenarios.ts).
 */

export const metadata: Metadata = { title: "My plan, Attraction 1 added" };

export default function Page() {
  return <MyPlanScreen scenario="addedA1" />;
}
