"use client";

import { AtlasAsset, AtlasIcon } from "./asset";
import { checkIn, useDemoEvent } from "./demo/demo-store";
import { ACHIEVEMENT_TITLES, useLivePlan, type LivePlan } from "./demo/live";
import { STOPS, checkInTime, clock, type StopId } from "./demo/plan-model";
import type { ScreenKey } from "./screen-hrefs";
import { AtlasButton, AtlasTextLink } from "./ui";

/*
 * Unlocked · Achievement unlocked — Figma frame 1:466 — and its UnlockedA1 (2018) and UnlockedP1
 * (5064) variants. Achievements are unlocks, not points: the screen names the achievement and
 * where it was earned, then points to what comes next in the plan.
 *
 * Arriving here records the (simulated) check-in in the demo state, so My plan, Achievements and
 * Profile agree with it. Which place it names: the stop the guest was checking in at, otherwise
 * the design's own example for that frame.
 */

export type UnlockedVariant = "partner" | "attraction" | "partner-1";

function subjectOf(variant: UnlockedVariant, live: LivePlan): StopId {
  if (variant === "partner-1") return "partner-1";
  const kind = variant === "attraction" ? "attraction" : "partner";
  const { checkInTarget, lastCheckIn } = live.state;
  if (checkInTarget && STOPS[checkInTarget].kind === kind) return checkInTarget;
  if (lastCheckIn && STOPS[lastCheckIn].kind === kind && lastCheckIn !== "partner-1") return lastCheckIn;
  return variant === "attraction" ? "attraction-1" : "partner-2";
}

type Next = { step: number; label: string; text: string; action: { label: string; to: ScreenKey } };

function whatsNext(variant: UnlockedVariant, live: LivePlan, subject: StopId): Next | undefined {
  const upcoming = live.timing.stops.filter((s) => s.status !== "done" && s.id !== subject);
  const first = upcoming[0];
  if (!first) return undefined;
  if (first.status === "unavailable") {
    return {
      step: first.position,
      label: "Next stop needs attention",
      text: `${STOPS[first.id].name} isn't available anymore`,
      action: { label: `Fix stop ${first.position}`, to: "Repair" },
    };
  }
  const where = STOPS[first.id].kind === "facility" ? "in Hotel A" : `${first.walk} min walk`;
  return {
    step: first.position,
    label: "Next in your plan",
    text: `${STOPS[first.id].name} · ${where}`,
    action: variant === "partner-1" ? { label: "Choose next stop", to: "NextPath" } : { label: "Back to my plan", to: "MyPlan" },
  };
}

function Pattern() {
  return (
    <>
      <AtlasAsset
        src="/atlas-ui/pattern-beige-wave-2.svg"
        width={390}
        height={139}
        className="pointer-events-none absolute left-0 top-[36px] opacity-45 wide:hidden"
      />
      {/* Wider screens repeat the same artwork across the width rather than stretching it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[36px] hidden h-[139px] bg-repeat-x opacity-45 wide:block"
        style={{ backgroundImage: "url(/atlas-ui/pattern-beige-wave-2.svg)" }}
      />
    </>
  );
}

export function UnlockedScreen({ variant }: { variant: UnlockedVariant }) {
  const live = useLivePlan();
  const subject = subjectOf(variant, live);
  useDemoEvent(() => checkIn(subject), `unlock-${subject}`);

  const stop = STOPS[subject];
  const achievement = stop.achievement;
  const done = live.state.plan.completed.find((c) => c.id === subject);
  const at = done?.at ?? checkInTime(live.state.plan, live.state.preferences.time, subject);
  const next = whatsNext(variant, live, subject);

  return (
    <main className="atlas-dark relative flex min-h-[100dvh] w-full flex-col items-center bg-atlas-teal">
      <Pattern />

      <div
        role="status"
        className="relative flex min-h-px w-full max-w-[480px] flex-1 flex-col items-center justify-center gap-[16px] px-[24px] pt-[calc(120px+env(safe-area-inset-top))] short:pt-[32px]"
      >
        <span className="flex size-[112px] shrink-0 items-center justify-center rounded-[56px] border-[6px] border-atlas-bronze/60 bg-atlas-paper">
          <AtlasIcon src="/atlas-ui/icon-ach-teal-52.svg" size={52} />
        </span>
        <p className="font-grotesk text-[12px] uppercase leading-[15px] tracking-[1.2px] text-atlas-beige">Achievement unlocked</p>
        <h1 className="w-full text-center font-grotesk text-[30px] font-bold leading-[34px] text-atlas-paper">You made it part of your journey.</h1>
        <p className="text-center font-manrope text-[16px] leading-[22px] text-atlas-linen">
          {achievement ? ACHIEVEMENT_TITLES[achievement] : "Visited"} · {stop.name}
        </p>
        <p className="text-center font-manrope text-[13px] leading-[18px] text-atlas-beige">
          Today, {clock(at)} · Saved in this browser (prototype)
        </p>
      </div>

      {next ? (
        <div className="relative w-full max-w-[480px] px-[16px]">
          <div className="flex w-full items-center gap-[12px] rounded-[16px] border border-atlas-beige/40 bg-atlas-paper/10 p-[14px]">
            <span className="flex size-[36px] shrink-0 items-center justify-center rounded-[18px] border-2 border-atlas-beige font-manrope text-[14px] font-semibold leading-[19px] text-atlas-paper">
              {next.step}
            </span>
            <span className="flex min-w-0 flex-1 flex-col items-start gap-[2px]">
              <span className="font-manrope text-[12px] leading-[16px] text-atlas-beige">{next.label}</span>
              <span className="w-full font-manrope text-[15px] font-semibold leading-[20px] text-atlas-paper">{next.text}</span>
            </span>
          </div>
        </div>
      ) : null}

      <div className="relative flex w-full max-w-[480px] flex-col items-start gap-[8px] px-[16px] pb-[calc(28px+env(safe-area-inset-bottom))] pt-[16px]">
        <AtlasButton to={next?.action.to ?? "MyPlan"} tone="light">
          {next?.action.label ?? "Back to my plan"}
        </AtlasButton>
        <AtlasTextLink to="Achievements" className="!text-atlas-paper">
          See my achievements
        </AtlasTextLink>
      </div>
    </main>
  );
}
