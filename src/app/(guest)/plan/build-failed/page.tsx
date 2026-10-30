import type { Metadata } from "next";
import { AtlasBackButton, AtlasBadge, AtlasButton, AtlasTextLink, FlowScreen, type } from "@/components/atlas-ui/ui";

/*
 * PlanBuildFailed · Couldn't build the plan — Figma frame 70:3918. What Plan building shows when
 * the planner fails. The prototype's planner runs in the browser and cannot fail, so this is a
 * design-review route. The guest's choices are kept: "Try again" plans with them again.
 */

export const metadata: Metadata = { title: "Couldn't build the plan" };

export default function PlanBuildFailedPage() {
  return (
    <main>
      <FlowScreen gap={16}>
        <AtlasBackButton to="Preferences" />
        <div role="alert" className="flex min-h-px w-full flex-1 flex-col items-center justify-center gap-[14px]">
          <AtlasBadge icon="/atlas-ui/icon-warn-teal-32.svg" iconSize={32} size={72} tone="sand" />
          <h1 className={`w-full text-center ${type.title}`}>We couldn&apos;t build your plan</h1>
          <p className={`w-full text-center ${type.body} text-atlas-slate`}>
            Something went wrong on our side. Your time, interests and price level are saved.
          </p>
        </div>
        <div className="flex w-full flex-col items-start gap-[8px]">
          <AtlasButton to="PlanBuild">Try again</AtlasButton>
          <AtlasButton to="Preferences" tone="outline">
            Change time or interests
          </AtlasButton>
          <AtlasTextLink to="Main" tone="slate">
            Just show me places
          </AtlasTextLink>
        </div>
      </FlowScreen>
    </main>
  );
}
