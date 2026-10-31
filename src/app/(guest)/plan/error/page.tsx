import type { Metadata } from "next";
import { MissionsShell } from "@/components/atlas-ui/my-plan";
import { AtlasBadge, AtlasButton, AtlasTextLink } from "@/components/atlas-ui/ui";

/*
 * PlanError · Plan failed to load — Figma frame 70:3886. What My plan shows when the plan cannot
 * be loaded. The prototype keeps its plan in this browser, so nothing here can fail: this is a
 * design-review route. "Try again" reopens My plan.
 */

export const metadata: Metadata = { title: "Plan failed to load" };

export default function PlanErrorPage() {
  return (
    <MissionsShell>
      <div
        role="alert"
        className="flex w-full max-w-[560px] flex-col items-center gap-[12px] self-center rounded-[16px] border border-atlas-beige px-[16px] py-[32px]"
      >
        <AtlasBadge icon="/atlas-ui/icon-warn-teal-25.svg" iconSize={25} size={56} tone="sand" />
        <h1 className="w-full text-center font-grotesk text-[20px] font-bold leading-[1.15] text-atlas-teal">We couldn&apos;t load your plan</h1>
        <p className="w-full text-center font-manrope text-[14px] leading-[1.55] text-atlas-slate">
          Check your connection and try again. Your saved stops are safe.
        </p>
        <AtlasButton to="MyPlan">Try again</AtlasButton>
        <AtlasTextLink to="Main">Browse places instead</AtlasTextLink>
      </div>
    </MissionsShell>
  );
}
