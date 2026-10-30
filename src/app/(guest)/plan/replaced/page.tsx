import type { Metadata } from "next";
import { MyPlanScreen } from "@/components/atlas-ui/my-plan";

/*
 * MyPlanReplaced · My plan after replacing stop 3 — Figma frame 1:2180.
 *
 * A design-review route: it opens this state and seeds the demo plan with it (demo/scenarios.ts).
 */

export const metadata: Metadata = { title: "My plan, stop replaced" };

export default function Page() {
  return <MyPlanScreen scenario="replaced" />;
}
