import type { Metadata } from "next";
import { MyPlanScreen } from "@/components/atlas-ui/my-plan";

/*
 * MyPlanRemoved · My plan after removing stop 3 — Figma frame 1:2285.
 *
 * A design-review route: it opens this state and seeds the demo plan with it (demo/scenarios.ts).
 */

export const metadata: Metadata = { title: "My plan, stop removed" };

export default function Page() {
  return <MyPlanScreen scenario="removed" />;
}
