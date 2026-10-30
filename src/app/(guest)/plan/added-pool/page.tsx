import type { Metadata } from "next";
import { MyPlanScreen } from "@/components/atlas-ui/my-plan";

/*
 * MyPlanAddedPool · My plan with the pool added — Figma frame 1:2499.
 *
 * A design-review route: it opens this state and seeds the demo plan with it (demo/scenarios.ts).
 */

export const metadata: Metadata = { title: "My plan, pool added" };

export default function Page() {
  return <MyPlanScreen scenario="addedPool" />;
}
