"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AtlasIcon } from "./asset";
import { addStop, chooseCheckIn } from "./demo/demo-store";
import { ACHIEVEMENT_SCREEN, ACHIEVEMENT_TITLES, placeStatus, planLabel, useLivePlan } from "./demo/live";
import { STOPS, clock, type StopId } from "./demo/plan-model";
import { FRONT_DESK_NOTICE } from "./navigation";
import { PartnerAchievement, PlanChip, SMALL_ACTION } from "./place-detail";
import { screenHref, type ScreenKey } from "./screen-hrefs";
import { AtlasButton, AtlasLink } from "./ui";

/*
 * The parts of the place detail screens that follow the demo plan: the plan chip, the bottom
 * actions ("Add to my plan" becomes "View in my plan" once added), and the achievement card's
 * check-in, which is only offered for stops in today's plan — as the design's Partner Place 4
 * frame specifies.
 */

/** "Stop 2 today ›", "Visited today ✓" or "Not in today's plan". */
export function LivePlanChip({ place }: { place: StopId }) {
  const live = useLivePlan();
  const status = placeStatus(live, place);
  if (status === "done") {
    return (
      <PlanChip tone="sand" to="MyPlan">
        Visited today ✓
      </PlanChip>
    );
  }
  if (status === "not-planned") return <PlanChip tone="sand">Not in today&apos;s plan</PlanChip>;
  return (
    <PlanChip tone="teal" to="MyPlan">
      {`${planLabel(live, place) ?? "In today's plan"} ›`}
    </PlanChip>
  );
}

function addedMessage(place: StopId): string {
  return `Added ${STOPS[place].phrase} to your plan`;
}

/** The primary action: add to the plan, or open it once the place is there. */
export function PlanAction({ place, label = "Add to my plan", icon }: { place: StopId; label?: string; icon?: string }) {
  const router = useRouter();
  const live = useLivePlan();
  const status = placeStatus(live, place);
  if (status === "not-planned") {
    return (
      <AtlasButton
        className="min-w-0 flex-1"
        icon={icon}
        onClick={() => {
          addStop(place, addedMessage(place));
          router.push(screenHref("MyPlan") ?? "/plan");
        }}
      >
        {label}
      </AtlasButton>
    );
  }
  return (
    <AtlasButton to="MyPlan" icon="/atlas-ui/icon-list-light-19.svg" className="min-w-0 flex-1">
      {status === "done" ? "Back to my plan" : "View in my plan"}
    </AtlasButton>
  );
}

type Secondary =
  | { to: ScreenKey; icon: string; iconSize: number; label: string }
  | { notice: string; icon: string; iconSize: number; label: string };

/**
 * Bottom actions bar: a square secondary action beside the primary one. Facility and attraction
 * bars are 88 tall with a 56 x 60 secondary; partner bars 80 with 52 x 52.
 */
export function DetailActions({ secondary, primary, tall = false }: { secondary: Secondary; primary: ReactNode; tall?: boolean }) {
  const [notice, setNotice] = useState<string | null>(null);
  const square = `flex shrink-0 items-center justify-center rounded-[14px] border border-atlas-teal ${tall ? "h-[60px] w-[56px]" : "size-[52px]"}`;
  return (
    <div className="border-t border-atlas-beige bg-atlas-paper">
      {notice ? (
        <p role="status" className="mx-[16px] mt-[10px] rounded-[10px] bg-atlas-sand px-[10px] py-[8px] font-manrope text-[13px] leading-[18px] text-atlas-ink">
          {notice}
        </p>
      ) : null}
      <div className={`flex w-full items-start gap-[10px] px-[16px] pb-[calc(17px+env(safe-area-inset-bottom))] pt-[10px] ${tall ? "min-h-[87px]" : "min-h-[79px]"}`}>
        {"to" in secondary ? (
          <AtlasLink to={secondary.to} label={secondary.label} className={square}>
            <AtlasIcon src={secondary.icon} size={secondary.iconSize} />
          </AtlasLink>
        ) : (
          <button type="button" aria-label={secondary.label} onClick={() => setNotice(secondary.notice)} className={square}>
            <AtlasIcon src={secondary.icon} size={secondary.iconSize} />
          </button>
        )}
        {primary}
      </div>
    </div>
  );
}

export const FRONT_DESK = { notice: FRONT_DESK_NOTICE, icon: "/atlas-ui/icon-phone-teal-22.svg", iconSize: 22, label: "Call the front desk" } as const;

function CheckInScanLink({ place, to, className, children }: { place: StopId; to: ScreenKey; className: string; children: ReactNode }) {
  return (
    <Link href={screenHref(to) ?? "/"} onClick={() => chooseCheckIn(place)} className={className}>
      {children}
    </Link>
  );
}

/** Achievement card on partner screens, following the plan: unlocked, scannable, or not yet. */
export function PartnerAchievementLive({ place }: { place: StopId }) {
  const live = useLivePlan();
  const status = placeStatus(live, place);
  const achievement = STOPS[place].achievement;
  if (!achievement) return null;
  const title = ACHIEVEMENT_TITLES[achievement];
  const detail = ACHIEVEMENT_SCREEN[achievement];

  if (status === "done") {
    const at = live.state.plan.completed.find((c) => c.id === place)?.at;
    return (
      <PartnerAchievement
        title={title}
        line={`Unlocked today at ${clock(at ?? 0)}`}
        action={
          detail ? (
            <AtlasLink to={detail} className={`${SMALL_ACTION} border border-atlas-teal text-atlas-teal`}>
              View
            </AtlasLink>
          ) : null
        }
      />
    );
  }

  if (status === "not-planned") {
    return (
      <PartnerAchievement
        title={title}
        line="Add it to today's plan, then scan the code there"
        action={
          <span aria-disabled="true" className={`${SMALL_ACTION} bg-atlas-mist text-atlas-ink`}>
            <AtlasIcon src="/atlas-ui/icon-qr-ink-16.svg" size={16} />
            Scan
          </span>
        }
        footer={
          <p className="flex min-h-[36px] items-center font-manrope text-[13px] leading-[18px] text-atlas-slate">
            Check-in only works for stops in today&apos;s plan.
          </p>
        }
      />
    );
  }

  return (
    <PartnerAchievement
      title={title}
      line="Scan the code at the counter to unlock"
      action={
        <CheckInScanLink place={place} to="PermCamera" className={`${SMALL_ACTION} bg-atlas-teal text-atlas-paper`}>
          <AtlasIcon src="/atlas-ui/icon-qr-light-16.svg" size={16} />
          Scan
        </CheckInScanLink>
      }
      footer={
        <CheckInScanLink
          place={place}
          to="Unlocked"
          className="flex min-h-[36px] items-center font-manrope text-[13px] font-semibold leading-[18px] text-atlas-teal"
        >
          No code there? Check in with your location
        </CheckInScanLink>
      }
    />
  );
}

/** The attraction's camera-view card (AttractionDetail 1:925). */
export function AttractionAchievementLive({ place }: { place: StopId }) {
  const live = useLivePlan();
  const achievement = STOPS[place].achievement;
  if (!achievement) return null;
  const unlocked = live.unlocked.includes(achievement);
  const detail = ACHIEVEMENT_SCREEN[achievement];
  return (
    <section className="flex w-full flex-col items-start gap-[10px] rounded-[16px] border border-atlas-teal p-[16px]">
      <div className="flex w-full items-center gap-[12px]">
        <span className="flex size-[44px] shrink-0 items-center justify-center rounded-[22px] bg-atlas-teal">
          <AtlasIcon src="/atlas-ui/icon-ach-light-20.svg" size={20} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col items-start gap-[2px]">
          <span className="font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal">{ACHIEVEMENT_TITLES[achievement]}</span>
          <span className="font-manrope text-[13px] leading-[18px] text-atlas-slate">{unlocked ? "Unlocked today" : "Not unlocked yet"}</span>
        </span>
      </div>
      {unlocked ? (
        detail ? (
          <AtlasButton to={detail} tone="outline">
            View achievement
          </AtlasButton>
        ) : null
      ) : (
        <>
          <p className="w-full font-manrope text-[14px] leading-[1.55] text-atlas-ink">
            When you are there, open the camera view and find the marker. There is no code to scan here.
          </p>
          <CheckInScanLink
            place={place}
            to="ARUnlock"
            className="flex h-[52px] w-full items-center justify-center gap-[8px] rounded-[14px] border border-atlas-teal font-manrope text-[16px] font-semibold leading-[22px] text-atlas-teal"
          >
            <AtlasIcon src="/atlas-ui/icon-camera-teal-19.svg" size={19} className="shrink-0" />
            <span>Open camera view</span>
          </CheckInScanLink>
          <p className="w-full text-center font-manrope text-[13px] leading-[18px] text-atlas-slate">
            Works within about 50 m. No camera? You can unlock with your location.
          </p>
        </>
      )}
    </section>
  );
}
