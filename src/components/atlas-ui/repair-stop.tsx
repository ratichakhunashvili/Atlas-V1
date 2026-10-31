"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AtlasAsset, AtlasIcon } from "./asset";
import { removeStop, replaceStop } from "./demo/demo-store";
import { useLivePlan } from "./demo/live";
import { STOPS, clock, suggestReplacement, timePlan } from "./demo/plan-model";
import { AtlasDialog } from "./dialog";
import { PLACES, type PlaceId } from "./fixtures";
import { PriceLevel } from "./place-card";
import { screenHref } from "./screen-hrefs";
import { AtlasBackButton, AtlasButton, AtlasTextLink, FlowScreen, Spacer, type } from "./ui";

/*
 * Repair · Fix an unavailable stop — Figma frame 1:778 — and RepairConfirm (1:1423), the remove
 * confirmation over it.
 *
 * A stop whose partnership ended can't stay in the plan. The suggested replacement is one of
 * Hotel A's own approved places that matches the guest's choices — never an unapproved nearby
 * business — and the screen says honestly when it would make the plan run over. Replacing or
 * removing changes the demo plan, with Undo on My plan.
 */

export function RepairStop({ confirmOnOpen = false }: { confirmOnOpen?: boolean }) {
  const router = useRouter();
  const live = useLivePlan();
  const { plan, preferences } = live.state;
  const [confirming, setConfirming] = useState(confirmOnOpen);
  const broken = live.timing.stops.find((s) => s.status === "unavailable");
  const toPlan = () => router.push(screenHref("MyPlan") ?? "/plan");

  if (!broken) {
    return (
      <FlowScreen className="!px-[16px] !pb-[24px]">
        <AtlasBackButton to="MyPlan" />
        <h1 className={`w-full ${type.title}`}>Nothing to fix</h1>
        <p className={`w-full ${type.body} text-atlas-slate`}>Every stop left in your plan is still available.</p>
        <Spacer />
        <AtlasButton to="MyPlan">Back to my plan</AtlasButton>
      </FlowScreen>
    );
  }

  const brokenName = STOPS[broken.id].name;
  const suggestion = suggestReplacement(plan, preferences, preferences.time);
  const swapped = suggestion
    ? timePlan({ ...plan, upcoming: plan.upcoming.map((u) => (u === broken.id ? suggestion : u)) }, preferences.time)
    : undefined;
  const swappedStop = swapped?.stops.find((s) => s.id === suggestion);
  const previous = live.timing.stops.filter((s) => s.position < broken.position && s.status !== "unavailable").at(-1);
  const following = live.timing.stops.find((s) => s.position > broken.position && s.status !== "unavailable");
  const place = suggestion && suggestion in PLACES ? PLACES[suggestion as PlaceId] : undefined;

  const replace = () => {
    if (!suggestion) return;
    replaceStop(broken.id, suggestion, `Stop ${broken.position} replaced with ${STOPS[suggestion].name}`);
    toPlan();
  };

  const remove = () => {
    removeStop(broken.id, `Stop ${broken.position} removed from your plan`);
    toPlan();
  };

  const closeConfirm = () => {
    setConfirming(false);
    const href = screenHref("Repair");
    if (confirmOnOpen && href) router.replace(href);
  };

  return (
    <>
      <FlowScreen className="!px-[16px] !pb-[24px]">
        <AtlasBackButton to="MyPlan" />
        <div className="flex w-full flex-col items-start gap-[8px]">
          <p className={type.eyebrow}>Stop {broken.position}</p>
          <h1 className="w-full font-grotesk text-[26px] font-bold leading-[30px] text-atlas-teal">{brokenName} isn&apos;t available anymore</h1>
          <p className={`w-full ${type.body} text-atlas-ink`}>
            It&apos;s no longer offered for Hotel A guests. Choose what to do with this stop. Your other stops stay as they are.
          </p>
        </div>

        {suggestion && place ? (
          <section className="flex w-full flex-col items-start gap-[10px]">
            <h2 className="font-grotesk text-[17px] font-bold leading-[22px] text-atlas-teal">Suggested instead</h2>
            <div className="flex w-full items-start gap-[12px] rounded-[16px] border-2 border-atlas-teal p-[12px]">
              <span className="relative size-[72px] shrink-0 overflow-hidden rounded-[12px] bg-atlas-beige">
                {place.listPhoto ? (
                  <AtlasAsset
                    src={place.listPhoto.src}
                    width={place.listPhoto.width}
                    height={place.listPhoto.height}
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : null}
              </span>
              <span className="flex min-w-0 flex-1 flex-col items-start gap-[4px]">
                <span className={type.eyebrow}>{place.eyebrow}</span>
                <span className="font-grotesk text-[17px] font-bold leading-[22px] text-atlas-teal">{place.name}</span>
                <span className="flex w-full flex-wrap items-center gap-[6px]">
                  <span className="font-manrope text-[13px] leading-[18px] text-atlas-ink">
                    {STOPS[suggestion].kind === "facility"
                      ? `In Hotel A · ${STOPS[suggestion].visit} min`
                      : `${swappedStop?.walk ?? 0} min from Stop ${previous?.position ?? 1} · ${STOPS[suggestion].visit} min`}
                  </span>
                  {place.price ? <PriceLevel price={place.price} /> : null}
                </span>
                {swapped ? (
                  <span className="w-full font-manrope text-[12px] leading-[16px] text-atlas-slate">
                    {swapped.overrun
                      ? `You'd be back around ${clock(swapped.returnAt)}, past your ${preferences.time} free`
                      : `You'd still be back by about ${clock(swapped.returnAt)}`}
                  </span>
                ) : null}
              </span>
            </div>
          </section>
        ) : (
          <p className="w-full rounded-[12px] bg-atlas-sand px-[12px] py-[10px] font-manrope text-[14px] leading-[1.5] text-atlas-ink">
            None of Hotel A&apos;s other approved places match your choices for this stop. You can remove it, or change your choices.
          </p>
        )}

        <div className="flex w-full items-start gap-[10px]">
          <AtlasIcon src="/atlas-ui/icon-info-slate.svg" size={18} className="shrink-0" />
          <p className="min-w-0 flex-1 font-manrope text-[13px] leading-[1.5] text-atlas-slate">
            Places you&apos;ve already checked in at won&apos;t change, and their achievements stay unlocked.
          </p>
        </div>

        <Spacer />
        <div className="flex w-full flex-col items-start gap-[8px]">
          {suggestion ? <AtlasButton onClick={replace}>Replace with {STOPS[suggestion].name}</AtlasButton> : null}
          <AtlasButton tone="outline" onClick={() => setConfirming(true)}>
            Remove this stop
          </AtlasButton>
        </div>
      </FlowScreen>

      <AtlasDialog open={confirming} onClose={closeConfirm} labelledBy="remove-stop-title" describedBy="remove-stop-body">
        <h2 id="remove-stop-title" className="font-grotesk text-[20px] font-bold leading-[26px] text-atlas-ink">
          Remove stop {broken.position}?
        </h2>
        <p id="remove-stop-body" className="w-full font-manrope text-[15px] leading-[23px] text-atlas-ink">
          {following
            ? `Your plan will go from ${previous ? STOPS[previous.id].name : "Hotel A"} straight to ${STOPS[following.id].name}.`
            : `Your plan will go from ${previous ? STOPS[previous.id].name : "Hotel A"} straight back to Hotel A.`}{" "}
          You can undo this for a few seconds.
        </p>
        <AtlasButton onClick={remove}>Remove stop</AtlasButton>
        <AtlasTextLink onClick={closeConfirm}>Keep it</AtlasTextLink>
      </AtlasDialog>
    </>
  );
}
