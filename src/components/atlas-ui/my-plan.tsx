"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AtlasAsset, AtlasIcon } from "./asset";
import { AtlasBottomBar } from "./bottom-bar";
import { CheckInLink } from "./demo/check-in-link";
import { clearFlash, seedDemo, undoLastChange, useDemoState, type DemoState } from "./demo/demo-store";
import { DETAIL_SCREEN, ROUTE_SCREEN, checkInLabel } from "./demo/live";
import { STOPS, clock, duration, timePlan, type TimedStop } from "./demo/plan-model";
import { scenarioState, type PlanScenario } from "./demo/scenarios";
import { ContextHeader, PlanSegment } from "./missions-chrome";
import { screenHref } from "./screen-hrefs";
import { AtlasButton, AtlasLink, AtlasTextLink, type } from "./ui";

/*
 * MyPlan · Missions › My plan — Figma frame 1:489 — and the states it moves through:
 * MyPlanReplaced (2180), MyPlanRemoved (2285), MyPlanAddedSpa (2378), MyPlanAddedPool (2499),
 * MyPlanAddedA1 (2620), MyPlanAddedP4 (2741) and MyPlanEmpty (1195).
 *
 * The plan is a timeline: start at the hotel, done stops, the next stop, later or unavailable
 * stops, and the way back. Every time, count and warning comes from one model
 * (demo/plan-model.ts), so the header, the stops and "Back to Hotel A" always agree. The design's
 * state routes seed that model (demo/scenarios.ts), then behave like the live plan.
 */

const DOT = "flex size-[28px] shrink-0 items-center justify-center rounded-[14px]";
const SMALL_BUTTON =
  "flex h-[44px] shrink-0 items-center justify-center rounded-[12px] border border-atlas-teal px-[12px] font-manrope text-[13px] font-semibold leading-[18px] text-atlas-teal";

export function Row({ dot, line, children, padded = true }: { dot: ReactNode; line?: "teal" | "beige"; children: ReactNode; padded?: boolean }) {
  return (
    <li className={`flex w-full items-start gap-[10px] ${padded ? "pb-[12px]" : ""}`}>
      <div aria-hidden className="flex w-[28px] shrink-0 flex-col items-center self-stretch">
        {dot}
        {line ? <div className={`min-h-px w-[2px] flex-1 ${line === "teal" ? "bg-atlas-teal" : "bg-atlas-beige"}`} /> : null}
      </div>
      {children}
    </li>
  );
}

export function NumberDot({ n, tone = "teal" }: { n: number; tone?: "teal" | "dashed" }) {
  return (
    <div
      className={`${DOT} border-2 font-manrope text-[13px] font-semibold leading-[18px] ${
        tone === "teal" ? "border-atlas-teal bg-atlas-paper text-atlas-teal" : "border-dashed border-atlas-slate text-atlas-slate"
      }`}
    >
      {n}
    </div>
  );
}

export function StopName({ stop, className }: { stop: TimedStop; className: string }) {
  const detail = DETAIL_SCREEN[stop.id];
  const name = STOPS[stop.id].name;
  return detail ? (
    <AtlasLink to={detail} className={`atlas-hit ${className}`}>
      {name}
    </AtlasLink>
  ) : (
    <span className={className}>{name}</span>
  );
}

export function stopMeta(stop: TimedStop, previous: number): string {
  const fixture = STOPS[stop.id];
  if (fixture.kind === "facility") return `In Hotel A · ${fixture.visit} min`;
  return previous > 1 ? `${stop.walk} min from stop ${previous} · ${fixture.visit} min` : `${stop.walk} min walk · ${fixture.visit} min`;
}

/** The next stop's line: "11 min walk · 60 min visit". */
export function nextStopMeta(stop: TimedStop): string {
  const fixture = STOPS[stop.id];
  return fixture.kind === "facility" ? `In Hotel A · ${fixture.visit} min visit` : `${stop.walk} min walk · ${fixture.visit} min visit`;
}

function NextStop({ stop }: { stop: TimedStop }) {
  const fixture = STOPS[stop.id];
  const route = ROUTE_SCREEN[stop.id];
  const meta = nextStopMeta(stop);
  return (
    <Row dot={<NumberDot n={stop.position} />} line="beige">
      <div className="flex min-w-0 flex-1 flex-col items-start gap-[8px] rounded-[14px] border-2 border-atlas-teal p-[10px]">
        <div className="flex w-full items-center justify-between gap-[8px] text-atlas-teal">
          <StopName stop={stop} className="min-w-0 font-grotesk text-[16px] font-bold leading-[20px]" />
          <span className="shrink-0 font-manrope text-[12px] font-semibold leading-[16px]">Next</span>
        </div>
        <p className="font-manrope text-[12px] leading-[16px] text-atlas-slate">{meta}</p>
        <div className="flex w-full items-start gap-[8px]">
          <CheckInLink
            stop={stop.id}
            className="flex h-[44px] min-w-0 flex-1 items-center justify-center gap-[6px] rounded-[12px] bg-atlas-teal font-manrope text-[14px] font-semibold leading-[19px] text-atlas-paper"
          >
            <AtlasIcon src={fixture.kind === "attraction" ? "/atlas-ui/icon-camera-light-19.svg" : "/atlas-ui/icon-qr-light-17.svg"} size={17} />
            {checkInLabel(stop.id)}
          </CheckInLink>
          {route ? (
            <AtlasLink
              to={route}
              className="flex h-[44px] min-w-0 flex-1 items-center justify-center rounded-[12px] border border-atlas-teal font-manrope text-[14px] font-semibold leading-[19px] text-atlas-teal"
            >
              Directions
            </AtlasLink>
          ) : null}
        </div>
      </div>
    </Row>
  );
}

function LaterStop({ stop, previous }: { stop: TimedStop; previous: number }) {
  return (
    <Row dot={<NumberDot n={stop.position} />} line="beige">
      <div className="flex min-w-0 flex-1 items-center gap-[10px] rounded-[14px] border border-atlas-beige p-[10px]">
        <span className="flex min-w-0 flex-1 flex-col items-start gap-px text-left">
          <StopName stop={stop} className="font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal" />
          <span className="font-manrope text-[12px] leading-[16px] text-atlas-slate">{stopMeta(stop, previous)}</span>
        </span>
        <CheckInLink stop={stop.id} className={SMALL_BUTTON}>
          {checkInLabel(stop.id)}
        </CheckInLink>
      </div>
    </Row>
  );
}

/** First and last rows of the timeline: leaving Hotel A and walking back. */
export function StartRow() {
  return (
    <Row
      padded={false}
      line="teal"
      dot={
        <div className={`${DOT} bg-atlas-teal`}>
          <AtlasIcon src="/atlas-ui/icon-home-light-14.svg" size={14} />
        </div>
      }
    >
      <p className="min-w-0 flex-1 pb-[12px] pt-[4px] font-manrope text-[14px] leading-[19px] text-atlas-ink">
        <span className="font-semibold">Start at Hotel A</span> · 16:00
      </p>
    </Row>
  );
}

export function ReturnRow({ at }: { at: number }) {
  return (
    <Row
      padded={false}
      dot={
        <div className={`${DOT} border-2 border-atlas-teal bg-atlas-paper`}>
          <AtlasIcon src="/atlas-ui/icon-home-teal-14.svg" size={14} />
        </div>
      }
    >
      <p className="min-w-0 flex-1 pt-[4px] font-manrope text-[14px] leading-[19px] text-atlas-ink">
        <span className="font-semibold">Back to Hotel A</span> · around {clock(at)}
      </p>
    </Row>
  );
}

export function DoneStop({ stop }: { stop: TimedStop }) {
  const hasAchievement = Boolean(STOPS[stop.id].achievement);
  return (
    <Row
      padded={false}
      line="beige"
      dot={
        <div className={`${DOT} bg-atlas-teal`}>
          <AtlasIcon src="/atlas-ui/icon-check-light-14.svg" size={14} />
        </div>
      }
    >
      <div className="flex min-w-0 flex-1 flex-col items-start gap-px pb-[12px] text-left">
        <StopName stop={stop} className="font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal" />
        <span className="w-full font-manrope text-[12px] leading-[16px] text-atlas-slate">
          Checked in {clock(stop.checkedInAt ?? 0)} · {hasAchievement ? "achievement unlocked" : "visited"}
        </span>
      </div>
    </Row>
  );
}

export function UnavailableStop({ stop }: { stop: TimedStop }) {
  return (
    <Row dot={<NumberDot n={stop.position} tone="dashed" />} line="beige">
      <div className="flex min-w-0 flex-1 items-center gap-[10px] rounded-[14px] bg-atlas-sand p-[10px]">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-px">
          <p className="font-grotesk text-[16px] font-bold leading-[20px] text-atlas-slate line-through">{STOPS[stop.id].name}</p>
          <p className="font-manrope text-[12px] font-semibold leading-[16px] text-atlas-ink">Not available anymore</p>
        </div>
        <AtlasLink to="Repair" label={`Fix stop ${stop.position}, ${STOPS[stop.id].name}`} className={`${SMALL_BUTTON} bg-atlas-paper`}>
          Fix
        </AtlasLink>
      </div>
    </Row>
  );
}

export function MissionsShell({
  children,
  gap = 12,
  paddingBottom = 20,
  toast,
}: {
  children: ReactNode;
  gap?: number;
  paddingBottom?: number;
  toast?: ReactNode;
}) {
  return (
    <main className="relative flex min-h-[100dvh] w-full flex-col bg-atlas-paper">
      <div
        className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col items-start px-[12px] pt-[calc(12px+env(safe-area-inset-top))] wide:px-[24px] wide:pt-[calc(20px+env(safe-area-inset-top))]"
        style={{ gap, paddingBottom }}
      >
        <ContextHeader />
        <PlanSegment active="plan" />
        {children}
      </div>
      <div className="sticky bottom-0 z-10">
        {toast ? (
          <div className="absolute bottom-[calc(var(--atlas-nav-h)+12px)] left-[12px] right-[12px] wide:bottom-[16px] wide:left-auto wide:right-[24px] wide:w-[400px]">
            {toast}
          </div>
        ) : null}
        <AtlasBottomBar active="missions" />
      </div>
    </main>
  );
}

function PlanToast({ message, canUndo, onUndo }: { message: string; canUndo: boolean; onUndo: () => void }) {
  return (
    <div
      role="status"
      className="atlas-dark flex min-h-[52px] w-full items-center justify-between gap-[8px] rounded-[14px] bg-atlas-ink py-[4px] pl-[16px] pr-[8px] drop-shadow-[0px_6px_9px_rgba(28,41,41,0.3)]"
    >
      <p className="min-w-0 font-manrope text-[14px] leading-[19px] text-atlas-paper">{message}</p>
      {canUndo ? (
        <button
          type="button"
          onClick={onUndo}
          className="flex h-[44px] shrink-0 items-center px-[12px] font-manrope text-[14px] font-semibold leading-[19px] text-atlas-beige"
        >
          Undo
        </button>
      ) : null}
    </div>
  );
}

function EmptyPlan() {
  return (
    <MissionsShell gap={14} paddingBottom={24}>
      <div className="flex min-h-px w-full max-w-[560px] flex-1 flex-col items-start justify-center gap-[16px] self-center">
        <div className="w-full max-w-[366px] overflow-hidden">
          <AtlasAsset src="/atlas-ui/pattern-teal-wave.svg" width={366} height={130} className="max-w-none" />
        </div>
        <h1 className={`w-full ${type.title}`}>No plan for today yet</h1>
        <p className={`w-full ${type.body} text-atlas-slate`}>
          Tell us how much time you have and we will build a walking route from Hotel A and back.
        </p>
      </div>
      <div className="flex w-full max-w-[560px] flex-col self-center" style={{ gap: 14 }}>
        <AtlasButton to="Preferences">Plan my free time</AtlasButton>
        <AtlasTextLink to="Main">Browse places instead</AtlasTextLink>
      </div>
    </MissionsShell>
  );
}

function Plan({ state }: { state: DemoState }) {
  const router = useRouter();
  const { plan, preferences, flash } = state;
  const timing = timePlan(plan, preferences.time);

  // A confirmation clears itself after a while, like a system toast.
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(clearFlash, 6000);
    return () => clearTimeout(timer);
  }, [flash]);

  const undo = () => {
    undoLastChange();
    const href = screenHref("MyPlan");
    if (href && window.location.pathname !== href) router.replace(href);
  };

  const routeTo = timing.next ? ROUTE_SCREEN[timing.next.id] : undefined;
  // The stop each timed stop is walked from ("9 min from stop 2"); unavailable stops are skipped.
  const timedPositions = timing.stops.filter((s) => s.status !== "unavailable").map((s) => s.position);
  const previousOf = (position: number) => timedPositions.filter((p) => p < position).at(-1) ?? 1;

  return (
    <MissionsShell toast={flash ? <PlanToast message={flash.message} canUndo={Boolean(flash.undo)} onUndo={undo} /> : undefined}>
      <div className="atlas-plan-grid">
        <div data-area="head" className="flex w-full flex-col items-start gap-[12px]">
          <div className="flex w-full items-center justify-between">
            <h1 className="font-grotesk text-[20px] font-bold leading-[26px] text-atlas-teal">Today</h1>
            <AtlasLink
              to="Preferences"
              className="flex h-[44px] items-center gap-[6px] rounded-[22px] border border-atlas-beige px-[12px] font-manrope text-[13px] font-semibold leading-[18px] text-atlas-ink"
            >
              <AtlasIcon src="/atlas-ui/icon-edit-15.svg" size={15} />
              Re-plan
            </AtlasLink>
          </div>

          <div className="flex w-full flex-col items-start gap-[6px]">
            <div
              className={`flex w-full flex-wrap items-start justify-between gap-x-[8px] font-manrope text-[13px] leading-[18px] ${timing.overrun ? "font-semibold" : ""}`}
            >
              <p className="text-atlas-ink">
                <span className="font-semibold">
                  {timing.doneCount} of {timing.totalCount} stops
                </span>{" "}
                · back by {clock(timing.returnAt)}
              </p>
              <p className="font-semibold text-atlas-teal">{timing.overrun ? "Runs over" : `${duration(timing.left)} left`}</p>
            </div>
            <div
              role="progressbar"
              aria-label="Stops done today"
              aria-valuemin={0}
              aria-valuemax={timing.totalCount}
              aria-valuenow={timing.doneCount}
              className="flex w-full items-start gap-[4px]"
            >
              {Array.from({ length: timing.totalCount }, (_, index) => (
                <div key={index} className={`h-[5px] min-w-px flex-1 rounded-[3px] ${index < timing.doneCount ? "bg-atlas-teal" : "bg-atlas-beige"}`} />
              ))}
            </div>
            {timing.overrun ? (
              <div role="alert" className="flex w-full items-center gap-[8px] rounded-[10px] bg-atlas-sand px-[10px] py-[8px]">
                <AtlasIcon src="/atlas-ui/icon-clock-16.svg" size={16} className="shrink-0" />
                <p className="min-w-0 flex-1 font-manrope text-[13px] leading-[18px] text-atlas-ink">
                  This plan now runs past your {preferences.time} free. Remove a stop or re-plan.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div data-area="aside" className="flex w-full flex-col items-start gap-[12px]">
          <AtlasLink
            to={routeTo ?? "Main"}
            label={routeTo ? "Open the walking route to your next stop" : "Open the map"}
            className="relative block h-[92px] w-full max-w-[358px] shrink-0 overflow-hidden rounded-[14px] bg-atlas-dune"
          >
            <AtlasAsset src="/atlas-ui/route-preview-art.svg" width={358} height={92} className="absolute left-0 top-0 max-w-none" />
            <span className="absolute right-[12px] top-[62px] flex items-center justify-center rounded-[10px] bg-atlas-paper px-[9px] py-[3px] font-manrope text-[12px] font-semibold leading-[16px] text-atlas-teal min-[390px]:left-[274px] min-[390px]:right-auto">
              Open map
            </span>
          </AtlasLink>
        </div>

        <div data-area="list" className="flex w-full flex-col items-start gap-[12px]">
          <ol aria-label="Today's stops" className="flex w-full flex-col items-start">
            <StartRow />

            {timing.stops.map((stop) => {
              if (stop.status === "done") return <DoneStop key={stop.id} stop={stop} />;
              if (stop.status === "unavailable") return <UnavailableStop key={stop.id} stop={stop} />;
              return stop.status === "next" ? (
                <NextStop key={stop.id} stop={stop} />
              ) : (
                <LaterStop key={stop.id} stop={stop} previous={previousOf(stop.position)} />
              );
            })}

            <ReturnRow at={timing.returnAt} />
          </ol>
          <p className="w-full font-manrope text-[12px] leading-[16px] text-atlas-slate">
            Prototype: this plan is kept in this browser only, not in an Atlas account.
          </p>
        </div>
      </div>
    </MissionsShell>
  );
}

/**
 * My plan from the demo state. A design-review route passes `scenario`: it renders that state
 * on the server and seeds the demo state with it on arrival, after which it is the live plan.
 */
export function MyPlanScreen({ scenario }: { scenario?: PlanScenario }) {
  const live = useDemoState();
  useEffect(() => {
    if (scenario) seedDemo(scenario, scenarioState(scenario));
  }, [scenario]);
  const state = scenario && live.seededFrom !== scenario ? scenarioState(scenario) : live;
  return state.plan.planned ? <Plan state={state} /> : <EmptyPlan />;
}
