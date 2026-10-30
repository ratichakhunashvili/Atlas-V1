"use client";

import { useRouter } from "next/navigation";
import { AtlasBottomBar } from "./bottom-bar";
import { setPreferences, useDemoState } from "./demo/demo-store";
import { achievementLabel, preferencesSummary, useLivePlan } from "./demo/live";
import { matchingStops, proposePlan, type Interest, type Preferences } from "./demo/plan-model";
import { PLACES } from "./fixtures";
import { ContextHeader, PlanSegment } from "./missions-chrome";
import { PlaceRow } from "./place-row";
import { hoursPhrase } from "./plan-flow";
import { screenHref } from "./screen-hrefs";
import { AtlasButton, AtlasLink } from "./ui";

/*
 * NoMatch · Missions › No partner fits — Figma frame 1:352.
 *
 * When no place Hotel A has approved matches the guest's choices, or none fits their time, Atlas
 * says so plainly, offers ways to widen the search, and shows the hotel's own facilities. It
 * never substitutes a business that is not one of Hotel A's approved partners.
 *
 * It describes the guest's current choices. Opened directly while those choices do have a plan
 * (from /guide), it shows the design's own example — Nightlife, 2 h — and labels it as such.
 */

const DESIGN_EXAMPLE: Preferences = { time: "2 h", interests: ["Nightlife"], price: "Any" };
const WIDEN_WITH: Interest[] = ["Food", "Culture"];

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "your choices";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

export function NoMatchScreen() {
  const router = useRouter();
  const { preferences, plan } = useDemoState();
  const live = useLivePlan();
  const ownProposal = proposePlan(preferences, plan.completed);
  const example = ownProposal.kind === "plan";
  const prefs = example ? DESIGN_EXAMPLE : preferences;
  const proposal = example ? proposePlan(DESIGN_EXAMPLE, plan.completed) : ownProposal;
  const interests = list(prefs.interests);

  const missing = WIDEN_WITH.filter((interest) => !prefs.interests.includes(interest));
  const widened: Preferences = { ...prefs, interests: [...prefs.interests, ...missing] };
  const widenedCount = matchingStops(widened).length;

  const widen = () => {
    setPreferences(widened);
    router.push(screenHref("PlanBuild") ?? "/plan/building");
  };

  return (
    <main className="relative flex min-h-[100dvh] w-full flex-col bg-atlas-paper">
      <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-start gap-[14px] px-[16px] pb-[12px] pt-[calc(12px+env(safe-area-inset-top))] wide:pt-[calc(20px+env(safe-area-inset-top))]">
        <ContextHeader summary={example ? preferencesSummary(DESIGN_EXAMPLE) : undefined} />
        <PlanSegment active="explore" />
        {example ? (
          <p className="rounded-[10px] border border-dashed border-atlas-umber px-[10px] py-[6px] font-manrope text-[12px] leading-[16px] text-atlas-slate">
            Design example: your current choices do have a plan, so this shows the case of choosing Nightlife.
          </p>
        ) : null}
        <div className="flex w-full flex-col items-start gap-[8px]">
          <h1 className="w-full font-grotesk text-[24px] font-bold leading-[28px] text-atlas-teal">No partner fits this time</h1>
          <p className="w-full font-manrope text-[15px] leading-[23px] text-atlas-ink">
            {proposal.kind === "no-time"
              ? `Hotel A's approved places for ${interests} don't fit in ${hoursPhrase(prefs.time)} with the walk back. Try more time, or enjoy what the hotel offers.`
              : `None of Hotel A's approved partners match ${interests} right now. Try one of these, or enjoy what the hotel offers.`}
          </p>
        </div>
        {missing.length > 0 ? (
          <button
            type="button"
            onClick={widen}
            className="flex min-h-[48px] w-full items-center justify-between gap-[8px] rounded-[12px] border border-atlas-beige px-[14px] font-manrope text-[14px] leading-[19px]"
          >
            <span className="text-left text-atlas-ink">Add {list(missing)}</span>
            <span className="shrink-0 font-semibold text-atlas-teal">
              {widenedCount} {widenedCount === 1 ? "place" : "places"}
            </span>
          </button>
        ) : null}
        <AtlasLink
          to="List"
          className="flex min-h-[48px] w-full items-center justify-between gap-[8px] rounded-[12px] border border-atlas-beige px-[14px] font-manrope text-[14px] leading-[19px]"
        >
          <span className="text-atlas-ink">Show everything Hotel A offers</span>
          <span className="shrink-0 font-semibold text-atlas-teal">{Object.keys(PLACES).length} places</span>
        </AtlasLink>
        <h2 className="font-grotesk text-[18px] font-bold leading-[23px] text-atlas-teal">At Hotel A</h2>
        <PlaceRow place={PLACES.pool} photo={PLACES.pool.photo} achievement={achievementLabel(live, "pool")} />
        <PlaceRow place={PLACES.spa} photo={PLACES.spa.photo} achievement={achievementLabel(live, "spa")} />
        <AtlasButton to="Preferences">Change interests or time</AtlasButton>
        <p className="w-full text-center font-manrope text-[13px] leading-[18px] text-atlas-slate">
          Not finding what you want? Hotel A&apos;s front desk can help.
        </p>
      </div>
      <div className="sticky bottom-0 z-10">
        <AtlasBottomBar active="missions" />
      </div>
    </main>
  );
}
