"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AtlasIcon } from "./asset";
import { AtlasBottomBar } from "./bottom-bar";
import { chooseCheckIn } from "./demo/demo-store";
import { useLivePlan, type LivePlan } from "./demo/live";
import { STOPS, type StopId } from "./demo/plan-model";
import type { ScanProblem } from "./scan-problems";
import { screenHref, type ScreenKey } from "./screen-hrefs";
import { AtlasButton, AtlasLink, AtlasTextLink } from "./ui";

/*
 * The Scan tab: Scan (1:410) and the six check-in problems (1:1042 – 1:1127).
 *
 * The camera area is the design's own placeholder — a dark surface, not a camera. Nothing is
 * photographed, scanned, located or sent: tapping the viewfinder simulates a good scan at the
 * stop the guest is checking in at, as the prototype does, and the real camera, code reader and
 * location check plug in here later.
 *
 * Phone: the camera area above a sheet; on short screens the page scrolls rather than letting
 * the sheet cover the viewfinder. Wide layout: the sheet becomes a panel beside the camera area.
 */

export function CameraLayout({ camera, panel, label, labelTop }: { camera: ReactNode; panel: ReactNode; label: string; labelTop: number }) {
  return (
    <main className="flex min-h-[100dvh] w-full flex-col bg-atlas-night wide:grid wide:h-[100dvh] wide:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
      <div className="atlas-dark relative min-h-[440px] w-full flex-1 overflow-hidden short:min-h-[360px] wide:h-full wide:min-h-0">
        {camera}
        <p
          aria-hidden
          className="absolute left-0 right-0 px-[16px] text-center font-manrope text-[12px] leading-[16px] text-atlas-mist wide:bottom-[20px] wide:top-auto!"
          style={{ top: `min(${labelTop}px, calc(100% - 36px))` }}
        >
          {label}
        </p>
      </div>
      <div className="relative w-full wide:flex wide:h-full wide:flex-col wide:overflow-y-auto wide:bg-atlas-paper">{panel}</div>
    </main>
  );
}

export function CloseButton({ to = "Main", label }: { to?: ScreenKey; label?: string }) {
  return (
    <AtlasLink
      to={to}
      label={label ?? (to === "AttractionDetail" ? "Close the camera view" : "Close the scanner")}
      className="absolute left-[16px] top-[calc(16px+env(safe-area-inset-top))] z-10 flex size-[44px] items-center justify-center rounded-[12px] bg-atlas-ink/75"
    >
      <AtlasIcon src="/atlas-ui/icon-close-light.svg" size={20} />
    </AtlasLink>
  );
}

const CORNER = "absolute size-[44px] border-atlas-beige";

/** The four Warm Beige corners of the viewfinder; place inside a relative square. */
export function ViewfinderCorners() {
  return (
    <>
      <span className={`${CORNER} left-0 top-0 rounded-tl-[14px] border-l-4 border-t-4`} />
      <span className={`${CORNER} right-0 top-0 rounded-tr-[14px] border-r-4 border-t-4`} />
      <span className={`${CORNER} bottom-0 left-0 rounded-bl-[14px] border-b-4 border-l-4`} />
      <span className={`${CORNER} bottom-0 right-0 rounded-br-[14px] border-b-4 border-r-4`} />
    </>
  );
}

/** The stop the scanner checks in at: the one the guest chose, else the next partner in the plan. */
export function scanTarget(live: LivePlan): StopId | undefined {
  const chosen = live.state.checkInTarget;
  if (chosen && STOPS[chosen].kind === "partner") return chosen;
  return live.timing.stops.find((s) => (s.status === "next" || s.status === "later") && STOPS[s.id].kind === "partner")?.id;
}

function SimulatedCheckIn({ stop, className, label, children }: { stop: StopId; className: string; label?: string; children: ReactNode }) {
  return (
    <Link href={screenHref("Unlocked") ?? "/unlocked"} aria-label={label} onClick={() => chooseCheckIn(stop)} className={className}>
      {children}
    </Link>
  );
}

export function ScanScreen() {
  const [flash, setFlash] = useState(false);
  const live = useLivePlan();
  const target = scanTarget(live);
  const isNext = target && target === live.timing.next?.id;
  const name = target ? STOPS[target].name : undefined;

  const heading = target ? (
    <>
      <p className="font-grotesk text-[11px] font-medium uppercase leading-[14px] tracking-[0.88px] text-atlas-beige">
        {isNext ? "Next stop" : "Checking in at"}
      </p>
      <h1 className="font-grotesk text-[22px] font-bold leading-[28px] text-atlas-paper">{name}</h1>
      <p className="w-full text-center font-manrope text-[14px] leading-[19px] text-atlas-fog">
        Point your camera at the Atlas code at any partner&apos;s counter
      </p>
      <p className="flex items-center gap-[6px] font-manrope text-[13px] leading-[18px] text-atlas-paper">
        <AtlasIcon src="/atlas-ui/icon-pin-light-15.svg" size={15} />
        Location not checked in this prototype
      </p>
    </>
  ) : (
    <>
      <h1 className="font-grotesk text-[22px] font-bold leading-[28px] text-atlas-paper">No stop to check in at</h1>
      <p className="w-full text-center font-manrope text-[14px] leading-[19px] text-atlas-fog">
        Check-in works for partner stops in today&apos;s plan. Add one from the map or My plan.
      </p>
    </>
  );

  return (
    <CameraLayout
      label={target ? "[Camera placeholder] Tap the frame to simulate a scan" : "[Camera placeholder]"}
      labelTop={520}
      camera={
        <>
          <CloseButton />
          <button
            type="button"
            aria-pressed={flash}
            aria-label="Flashlight"
            onClick={() => setFlash(!flash)}
            className={`absolute right-[16px] top-[calc(16px+env(safe-area-inset-top))] z-10 flex size-[44px] items-center justify-center rounded-[22px] ${flash ? "bg-atlas-paper/30" : "bg-atlas-ink/75"}`}
          >
            <AtlasIcon src="/atlas-ui/icon-flash.svg" size={20} />
          </button>
          {/*
           * Heading and viewfinder in one column from 76 px down, as the design places them (the
           * viewfinder lands at 196 on a 390 x 844 screen); in flow, a wrapping heading pushes the
           * viewfinder down instead of covering it.
           */}
          <div className="relative flex flex-col items-center gap-[4px] px-[24px] pb-[52px] pt-[calc(76px+env(safe-area-inset-top))] wide:h-full wide:justify-center wide:pb-[52px] wide:pt-[76px]">
            <div className="flex w-full flex-col items-center gap-[6px] text-center wide:hidden">{heading}</div>
            {target ? (
            <SimulatedCheckIn
              stop={target}
              label={`Simulate a good scan at ${name}`}
              className="relative block size-[min(240px,calc(100vw_-_32px))] shrink-0 short:size-[min(200px,calc(100vw_-_32px))]"
            >
              <ViewfinderCorners />
            </SimulatedCheckIn>
            ) : null}
          </div>
        </>
      }
      panel={
        <>
          <div className="hidden flex-col items-center gap-[6px] bg-atlas-teal px-[24px] py-[20px] text-center wide:flex">{heading}</div>
          <section className="flex w-full flex-col items-start gap-[12px] rounded-t-[24px] bg-atlas-paper px-[16px] pb-[12px] pt-[18px] wide:rounded-none">
            <h2 className="font-grotesk text-[17px] font-bold leading-[22px] text-atlas-teal">Can&apos;t find the code?</h2>
            <p className="w-full font-manrope text-[14px] leading-[1.55] text-atlas-slate">Ask staff for the Atlas card, or use your location.</p>
            {target ? (
              <SimulatedCheckIn
                stop={target}
                className="flex h-[52px] w-full items-center justify-center rounded-[14px] border border-atlas-teal font-manrope text-[16px] font-semibold leading-[22px] text-atlas-teal"
              >
                Check in with my location
              </SimulatedCheckIn>
            ) : (
              <AtlasButton to="MyPlan" tone="outline">
                Open my plan
              </AtlasButton>
            )}
            <p className="w-full text-center font-manrope text-[12px] leading-[1.5] text-atlas-slate">
              Prototype: the camera isn&apos;t opened and your location isn&apos;t checked. Nothing is saved or sent.
            </p>
          </section>
          <AtlasBottomBar active="scan" />
        </>
      }
    />
  );
}

export function ScanProblemScreen({ problem }: { problem: ScanProblem }) {
  return (
    <CameraLayout
      label="[Camera placeholder, paused]"
      labelTop={200}
      camera={
        <>
          <CloseButton />
          <AtlasLink
            to={problem.next}
            className="absolute right-[16px] top-[calc(16px+env(safe-area-inset-top))] z-10 flex min-h-[44px] max-w-[calc(100%-92px)] items-center justify-center rounded-[22px] border border-dashed border-atlas-beige bg-atlas-ink/75 px-[14px] py-[4px] text-center font-manrope text-[12px] leading-[16px] text-atlas-paper"
          >
            Design review: case {problem.caseNumber} of 6 ›
          </AtlasLink>
        </>
      }
      panel={
        <section
          role="alertdialog"
          aria-labelledby="scan-problem-title"
          aria-describedby="scan-problem-body"
          className="flex w-full flex-col items-start gap-[14px] rounded-t-[24px] bg-atlas-paper px-[20px] pb-[calc(28px+env(safe-area-inset-bottom))] pt-[24px] wide:rounded-none"
        >
          <span className="flex size-[56px] items-center justify-center rounded-[28px] bg-atlas-sand">
            <AtlasIcon src={problem.icon} size={26} />
          </span>
          <h1 id="scan-problem-title" className="w-full font-grotesk text-[22px] font-bold leading-[25px] text-atlas-teal">
            {problem.title}
          </h1>
          <p id="scan-problem-body" className="w-full font-manrope text-[15px] leading-[23px] text-atlas-ink">
            {problem.body}
          </p>
          <AtlasButton to={problem.primary.to}>{problem.primary.label}</AtlasButton>
          <AtlasTextLink to={problem.secondary.to}>{problem.secondary.label}</AtlasTextLink>
        </section>
      }
    />
  );
}
