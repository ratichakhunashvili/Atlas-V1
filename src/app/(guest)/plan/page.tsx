import type { Metadata } from "next";
import { MyPlanScreen } from "@/components/atlas-ui/my-plan";

/*
 * MyPlan · Missions › My plan — Figma frame 1:489. The live demo plan.
 */

export const metadata: Metadata = { title: "My plan" };

export default function Page() {
  return <MyPlanScreen />;
}
