"use client";

import Link from "next/link";
import { AtlasAsset, AtlasIcon } from "./asset";
import { checkIn, chooseCheckIn, useDemoEvent } from "./demo/demo-store";
import { useLivePlan, type LivePlan } from "./demo/live";
import { STOPS, checkInTime, clock, type StopKind, type StopId } from "./demo/plan-model";
import { CameraLayout, CloseButton } from "./scan-screens";
import { screenHref } from "./screen-hrefs";
import { AtlasButton, FlowScreen, type } from "./ui";

/*
 * CheckedIn (1:1024) and ARUnlock (1:436): checking in at a hotel facility, and finding an
 * attraction's marker with the camera view. Both are simulated — no camera, code or location is
 * used — and both name the stop the guest chose, falling back to the design's example.
 */

function subjectOf(live: LivePlan, kind: StopKind, fallback: StopId): StopId {
  const { checkInTarget, lastCheckIn } = live.state;
  if (checkInTarget && STOPS[checkInTarget].kind === kind) return checkInTarget;
  if (lastCheckIn && STOPS[lastCheckIn].kind === kind) return lastCheckIn;
  return fallback;
}

/** CheckedIn · Checked in at a hotel facility — Figma frame 1:1024 (the pool). */
export function CheckedInScreen() {
  const live = useLivePlan();
  const subject = subjectOf(live, "facility", "pool");
  useDemoEvent(() => checkIn(subject), `checked-in-${subject}`);

  const stop = STOPS[subject];
  const at = live.state.plan.completed.find((c) => c.id === subject)?.at ?? checkInTime(live.state.plan, live.state.preferences.time, subject);
  const next = live.timing.stops.find((s) => (s.status === "next" || s.status === "later") && s.id !== subject);
  const nextText = next ? `${STOPS[next.id].name} · ${STOPS[next.id].kind === "facility" ? "in Hotel A" : `${next.walk} min walk`}` : undefined;

  return (
    <main>
      <FlowScreen>
        <div role="status" className="flex min-h-px w-full flex-1 flex-col items-center justify-center gap-[14px]">
          <span className="flex size-[96px] items-center justify-center rounded-[48px] bg-atlas-teal">
            <AtlasIcon src="/atlas-ui/icon-check-light-43.svg" size={43} />
          </span>
          <p className={type.eyebrow}>Checked in</p>
          <h1 className="w-full text-center font-grotesk text-[26px] font-bold leading-[30px] text-atlas-teal">You are at the {stop.name}</h1>
          <p className="font-manrope text-[15px] leading-[20px] text-atlas-slate">Today, {clock(at)} · Hotel A</p>
          <p className="w-full text-center font-manrope text-[14px] leading-[1.5] text-atlas-ink">
            {stop.achievement
              ? "Its achievement is already in your achievements. The visit is marked in your plan."
              : "This stop has no achievement, but it is marked as visited in your plan."}
          </p>
          <p className="w-full text-center font-manrope text-[12px] leading-[16px] text-atlas-slate">Prototype: saved in this browser only.</p>
        </div>
        {next && nextText ? (
          <div className="flex w-full items-center gap-[12px] rounded-[16px] border border-atlas-beige p-[14px]">
            <span className="flex size-[36px] shrink-0 items-center justify-center rounded-[18px] border-2 border-atlas-teal font-manrope text-[14px] font-semibold leading-[19px] text-atlas-teal">
              {next.position}
            </span>
            <span className="flex min-w-0 flex-1 flex-col items-start gap-[2px]">
              <span className="font-manrope text-[12px] leading-[16px] text-atlas-slate">Next in your plan</span>
              <span className="font-manrope text-[15px] font-semibold leading-[20px] text-atlas-ink">{nextText}</span>
            </span>
          </div>
        ) : null}
        <AtlasButton to="MyPlan">Continue</AtlasButton>
      </FlowScreen>
    </main>
  );
}

/** ARUnlock · AR unlock (attraction) — Figma frame 1:436. */
export function ArUnlockScreen() {
  const live = useLivePlan();
  const subject = subjectOf(live, "attraction", "attraction-1");
  const name = STOPS[subject].name;
  const unlockHref = screenHref("UnlockedA1") ?? "/unlocked/attraction-1";

  return (
    <CameraLayout
      label="[Camera placeholder · illustration]"
      labelTop={520}
      camera={
        <>
          <AtlasAsset
            src="/atlas-ui/ar-camera-view.svg"
            width={390}
            height={844}
            className="pointer-events-none absolute left-0 top-0 max-w-none wide:size-full wide:object-cover"
          />
          <CloseButton to="AttractionDetail" />
          <p className="absolute right-[16px] top-[calc(16px+env(safe-area-inset-top))] flex items-center gap-[8px] rounded-[18px] bg-atlas-ink/75 px-[14px] py-[8px] font-manrope text-[13px] leading-[18px] text-atlas-paper">
            <AtlasIcon src="/atlas-ui/icon-pin-light-16.svg" size={16} />
            Location not checked · prototype
          </p>
          <div className="absolute left-[24px] right-[24px] top-[calc(88px+env(safe-area-inset-top))] flex flex-col items-center gap-[4px] short:top-[calc(68px+env(safe-area-inset-top))]">
            <p className="font-grotesk text-[11px] font-medium uppercase leading-[14px] tracking-[0.88px] text-atlas-beige">Find the marker</p>
            <h1 className="font-grotesk text-[22px] font-bold leading-[28px] text-atlas-paper">{name}</h1>
          </div>
          <Link
            href={unlockHref}
            onClick={() => chooseCheckIn(subject)}
            className="absolute left-1/2 top-[calc(196px+env(safe-area-inset-top))] flex w-[140px] -translate-x-1/2 flex-col items-center gap-[8px] short:top-[calc(140px+env(safe-area-inset-top))]"
          >
            <span className="flex size-[88px] items-center justify-center rounded-[44px] bg-atlas-paper/18">
              <span className="flex size-[70px] items-center justify-center rounded-[35px] bg-atlas-bronze">
                <span className="flex size-[64px] items-center justify-center rounded-[32px] border-[3px] border-atlas-paper bg-atlas-teal">
                  <AtlasIcon src="/atlas-ui/icon-star-light-28.svg" size={28} />
                </span>
              </span>
            </span>
            <span className="rounded-[14px] bg-atlas-paper px-[12px] py-[6px] font-manrope text-[14px] font-semibold leading-[19px] text-atlas-teal">
              Tap to unlock
            </span>
          </Link>
        </>
      }
      panel={
        <section className="flex w-full flex-col items-start gap-[12px] rounded-t-[24px] bg-atlas-paper px-[16px] pb-[calc(28px+env(safe-area-inset-bottom))] pt-[20px] wide:rounded-none">
          <h2 className="font-grotesk text-[17px] font-bold leading-[22px] text-atlas-teal">Look around for the marker</h2>
          <p className="w-full font-manrope text-[14px] leading-[1.55] text-atlas-slate">
            Turn slowly toward {name}. The marker shows its direction; it may drift a little.
          </p>
          <Link
            href={unlockHref}
            onClick={() => chooseCheckIn(subject)}
            className="flex h-[52px] w-full items-center justify-center rounded-[14px] border border-atlas-teal font-manrope text-[16px] font-semibold leading-[22px] text-atlas-teal"
          >
            Unlock without camera
          </Link>
          <p className="w-full text-center font-manrope text-[12px] leading-[1.5] text-atlas-slate">
            Prototype: no camera or location is used. Tapping the marker simulates finding it.
          </p>
        </section>
      }
    />
  );
}
