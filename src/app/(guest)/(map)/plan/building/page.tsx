import type { Metadata } from "next";
import { PlanBuilding } from "@/components/atlas-ui/plan-flow";

/*
 * PlanBuild · Building a plan (loading) — Figma frame 1:1144.
 *
 * Plans with the guest's own choices from Preferences, then moves on after a moment — to Plan
 * ready, or to No partner fits when nothing approved matches — so the prototype flow can be
 * walked end to end. The real screen will wait for the planner on the server.
 */

export const metadata: Metadata = { title: "Planning your time" };

export default function PlanBuildingPage() {
  return <PlanBuilding />;
}
