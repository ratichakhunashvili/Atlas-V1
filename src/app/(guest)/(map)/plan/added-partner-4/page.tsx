import type { Metadata } from "next";
import { MyPlanScreen } from "@/components/atlas-ui/my-plan";

/*
 * MyPlanAddedP4 · My plan with Partner Place 4 added — Figma frame 1:2741.
 *
 * A design-review route: it opens this state and seeds the demo plan with it (demo/scenarios.ts).
 */

export const metadata: Metadata = { title: "My plan, Partner Place 4 added" };

export default function Page() {
  return <MyPlanScreen scenario="addedP4" />;
}
