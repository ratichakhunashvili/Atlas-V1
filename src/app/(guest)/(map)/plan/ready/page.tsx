import type { Metadata } from "next";
import { PlanReady } from "@/components/atlas-ui/plan-flow";

/*
 * PlanBuildDone · Plan ready — Figma frame 1:1156.
 *
 * When fewer approved places fit than the time allows, the plan is simply shorter, and the screen
 * says so. It never pads the plan with places Hotel A has not approved, and never offers a stop
 * that is no longer available.
 */

export const metadata: Metadata = { title: "Your plan for today" };

export default function PlanReadyPage() {
  return <PlanReady />;
}
