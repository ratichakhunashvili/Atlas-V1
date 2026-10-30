"use client";

import { AtlasIcon } from "./asset";
import { useDemoState } from "./demo/demo-store";
import { preferencesSummary } from "./demo/live";
import { HOTEL } from "./fixtures";
import { AtlasLink } from "./ui";

/*
 * Chrome shared by the Missions tab screens (map, list, my plan, no match).
 *
 * Context header (366 wide): hotel button ⇒ Stay, hotel name and preferences ⇒ Preferences,
 * edit ⇒ Preferences. The subtitle is the guest's own choices from Preferences (demo state).
 * Explore / My plan: the segmented switch under it.
 */

export function ContextHeader({ summary: override, className = "" }: { summary?: string; className?: string }) {
  const { preferences } = useDemoState();
  const summary = override ?? preferencesSummary(preferences);
  return (
    <div className={`flex w-full items-center gap-[10px] rounded-[14px] border border-atlas-beige bg-atlas-paper p-[4px] ${className}`}>
      <AtlasLink
        to="Stay"
        label="Your stay at Hotel A"
        className="flex size-[44px] shrink-0 items-center justify-center rounded-[12px] bg-atlas-teal"
      >
        <AtlasIcon src="/atlas-ui/icon-home-light-18.svg" size={18} />
      </AtlasLink>
      <AtlasLink to="Preferences" className="flex h-[44px] min-w-0 flex-1 flex-col items-start justify-center gap-px text-left">
        <span className="font-grotesk text-[15px] font-bold leading-[19px] text-atlas-teal">{HOTEL.name}</span>
        <span className="w-full truncate font-manrope text-[12px] leading-[16px] text-atlas-slate">{summary}</span>
      </AtlasLink>
      <AtlasLink
        to="Preferences"
        label="Edit time and interests"
        className="flex size-[44px] shrink-0 items-center justify-center rounded-[10px]"
      >
        <AtlasIcon src="/atlas-ui/icon-edit.svg" size={18} />
      </AtlasLink>
    </div>
  );
}

type Segment = "explore" | "plan";

const SEGMENT = "flex h-[44px] min-w-0 flex-1 items-center justify-center gap-[6px] rounded-[12px] font-manrope text-[14px] font-semibold leading-[19px]";

export function PlanSegment({ active, className = "" }: { active: Segment; className?: string }) {
  const explore = active === "explore";
  return (
    <nav aria-label="Missions view" className={`flex w-full items-start gap-[2px] rounded-[14px] bg-atlas-sand p-[2px] ${className}`}>
      {explore ? (
        <span aria-current="page" className={`${SEGMENT} bg-atlas-teal text-atlas-paper`}>
          <AtlasIcon src="/atlas-ui/icon-map-light.svg" size={16} />
          Explore
        </span>
      ) : (
        <AtlasLink to="Main" className={`${SEGMENT} text-atlas-teal`}>
          <AtlasIcon src="/atlas-ui/icon-map-teal.svg" size={16} />
          Explore
        </AtlasLink>
      )}
      {explore ? (
        <AtlasLink to="MyPlan" className={`${SEGMENT} text-atlas-teal`}>
          <AtlasIcon src="/atlas-ui/icon-list-teal.svg" size={16} />
          My plan
        </AtlasLink>
      ) : (
        <span aria-current="page" className={`${SEGMENT} bg-atlas-teal text-atlas-paper`}>
          <AtlasIcon src="/atlas-ui/icon-list-light.svg" size={16} />
          My plan
        </span>
      )}
    </nav>
  );
}
