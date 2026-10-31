"use client";

import { useState } from "react";
import { AtlasIcon } from "../asset";
import { AtlasBottomBar } from "../bottom-bar";
import { makeNextStop } from "../demo/demo-store";
import { useLivePlan } from "../demo/live";
import { STOPS, type StopId } from "../demo/plan-model";
import { ContextHeader, PlanSegment } from "../missions-chrome";
import { AtlasLink, AtlasTextLink } from "../ui";
import { useMapScene } from "./scene";

/*
 * MapNextPath — Figma frame 1:5494, with the "Map sheet · next stop" component set (1:5548).
 * After a check-in the guest picks what comes next without leaving the map.
 *
 * States, as the eight variants draw them:
 *   none      nothing chosen; the main action asks to choose ("Ask" adds an error line)
 *   chosen    the option gets a 2px stroke (bronze on the featured one) and a filled radio,
 *             and the main action names the choice
 *   saved     a status note under the options. The choice reorders the demo plan: the chosen
 *             place becomes the next stop and the rest keep their order after it.
 *
 * Phone: a sheet above the bar, scrolling when the screen is short. Wide: a side panel.
 */

type Option = {
  id: StopId;
  eyebrow: string;
  meta: string;
  note: string;
  featured?: boolean;
};

const OPTIONS: readonly Option[] = [
  { id: "partner-2", eyebrow: "Closest", meta: "11 min walk · 60 min · Budget", note: "Already next in today's plan." },
  {
    id: "attraction-1",
    eyebrow: "Featured experience",
    meta: "20 min walk · 45 min",
    note: "Recommended by Hotel A. History. Camera unlock is a prototype.",
    featured: true,
  },
  { id: "pool", eyebrow: "Something different", meta: "In Hotel A · 60 min", note: "A calmer stop at your hotel. No achievement here." },
];

const SHEET_HEIGHT = 560;

function actionFor(id: StopId, isNext: boolean): string {
  if (isNext) return `Keep ${STOPS[id].name} next`;
  return id === "pool" ? "Make the pool my next stop" : `Make ${STOPS[id].name} my next stop`;
}

function OptionCard({
  option,
  selected,
  note,
  onSelect,
}: {
  option: Option;
  selected: boolean;
  note: string;
  onSelect: () => void;
}) {
  const featured = Boolean(option.featured);
  const stroke = selected ? (featured ? "border-2 border-atlas-bronze" : "border-2 border-atlas-teal") : featured ? "border border-atlas-teal" : "border border-atlas-beige";
  return (
    <label
      className={`flex w-full cursor-pointer items-start gap-[10px] rounded-[14px] px-[12px] py-[10px] text-left has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-atlas-teal ${stroke} ${
        featured ? "bg-atlas-teal" : "bg-atlas-paper"
      }`}
    >
      <input type="radio" name="map-next-stop" checked={selected} onChange={onSelect} className="sr-only" />
      <span
        aria-hidden
        className={`flex size-[20px] shrink-0 items-center justify-center rounded-[10px] border-2 ${featured ? "border-atlas-beige" : "border-atlas-teal"}`}
      >
        {selected ? <span className={`size-[8px] rounded-[4px] ${featured ? "bg-atlas-beige" : "bg-atlas-teal"}`} /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-[3px]">
        <span className={`font-manrope text-[11px] font-semibold uppercase leading-[15px] tracking-[0.66px] ${featured ? "text-atlas-beige" : "text-atlas-slate"}`}>
          {option.eyebrow}
        </span>
        <span className={`font-grotesk text-[16px] font-bold leading-[20px] ${featured ? "text-atlas-paper" : "text-atlas-teal"}`}>
          {STOPS[option.id].name}
        </span>
        <span className={`font-manrope text-[13px] leading-[18px] ${featured ? "text-atlas-linen" : "text-atlas-ink"}`}>{option.meta}</span>
        <span className={`font-manrope text-[12px] leading-[16px] ${featured ? "text-atlas-beige" : "text-atlas-slate"}`}>{note}</span>
      </span>
    </label>
  );
}

export function NextStopSheet() {
  const live = useLivePlan();
  const [choice, setChoice] = useState<StopId | null>(null);
  const [asked, setAsked] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const nextId = live.timing.next?.id;
  const lastDone = live.state.plan.completed.at(-1);

  const choose = (id: StopId) => {
    setChoice(id);
    setAsked(false);
    setSaved(null);
  };

  const confirm = () => {
    if (!choice) {
      setAsked(true);
      return;
    }
    const name = STOPS[choice].name;
    if (choice === nextId) {
      setSaved(`${name} stays your next stop.`);
      return;
    }
    const before = nextId ? STOPS[nextId].name : null;
    makeNextStop(choice, `${choice === "pool" ? "The pool" : name} is your next stop`);
    setSaved(`${choice === "pool" ? "The pool" : name} is now your next stop${before ? `, before ${before}` : ""}. Saved in this browser only.`);
  };

  return (
    <section
      aria-label="Choose your next stop"
      className="flex w-full flex-col items-center gap-[8px] overflow-y-auto rounded-t-[22px] bg-atlas-paper px-[16px] pb-[12px] pt-[8px] shadow-[0px_-4px_18px_0px_rgba(28,41,41,0.1)] wide:h-auto! wide:rounded-none wide:p-0 wide:shadow-none"
      style={{ height: `min(${SHEET_HEIGHT}px, calc(100dvh - var(--atlas-nav-h) - 128px - env(safe-area-inset-top)))` }}
    >
      <div aria-hidden className="h-[4px] w-[36px] shrink-0 rounded-[2px] bg-atlas-beige wide:hidden" />
      <div className="flex w-full items-center gap-[10px]">
        <span className="flex size-[32px] shrink-0 items-center justify-center rounded-[16px] bg-atlas-teal">
          <AtlasIcon src="/atlas-ui/icon-check-light-16.svg" size={16} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col items-start">
          <span className="font-grotesk text-[15px] font-bold leading-[19px] text-atlas-teal">
            {lastDone ? `Checked in at ${STOPS[lastDone.id].name}` : "No check-ins yet today"}
          </span>
          <span className="font-manrope text-[12px] leading-[16px] text-atlas-slate">
            {live.timing.doneCount} of {live.timing.totalCount} stops done
            {lastDone && STOPS[lastDone.id].achievement ? " · achievement unlocked" : ""}
          </span>
        </span>
      </div>
      <h2 id="map-next-stop-title" className="w-full font-grotesk text-[17px] font-bold leading-[22px] text-atlas-teal">
        What would you like to do next?
      </h2>
      <div role="radiogroup" aria-labelledby="map-next-stop-title" className="flex w-full flex-col items-start gap-[8px]">
        {OPTIONS.map((option) => (
          <OptionCard
            key={option.id}
            option={option}
            selected={choice === option.id}
            note={option.id === "partner-2" && nextId !== "partner-2" ? "In today's plan." : option.note}
            onSelect={() => choose(option.id)}
          />
        ))}
      </div>
      {asked ? (
        <p role="alert" className="w-full font-manrope text-[13px] leading-[18px] text-atlas-danger">
          Choose one of the three first.
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="w-full rounded-[12px] bg-atlas-sand px-[12px] py-[10px] font-manrope text-[13px] leading-[1.45] text-atlas-ink">
          {saved}{" "}
          <AtlasLink to="MyPlan" className="font-semibold text-atlas-teal underline">
            View my plan
          </AtlasLink>
        </p>
      ) : null}
      <button
        type="button"
        onClick={confirm}
        className="flex h-[52px] w-full shrink-0 items-center justify-center rounded-[14px] bg-atlas-teal font-manrope text-[16px] font-semibold leading-[22px] text-atlas-paper"
      >
        {choice ? actionFor(choice, choice === nextId) : "Choose your next stop"}
      </button>
      <AtlasTextLink to="Main" className="!text-[14px] !leading-[19px]">
        Maybe later
      </AtlasTextLink>
    </section>
  );
}

export function NextStopMap() {
  useMapScene({
    places: [
      { id: "partner-2", marker: "partner-next" },
      { id: "partner-1", marker: "partner-checked" },
      { id: "pool", marker: "facility" },
      { id: "spa", marker: "facility" },
      { id: "partner-4", marker: "partner" },
      { id: "attraction-1", marker: "attraction" },
    ],
    hotel: true,
    you: true,
    bottomInset: 96 + SHEET_HEIGHT,
    allowTilt: true,
    panel: true,
  });

  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="contents wide:pointer-events-auto wide:absolute wide:bottom-[16px] wide:left-[16px] wide:top-[calc(16px+env(safe-area-inset-top))] wide:flex wide:w-[var(--atlas-panel-w)] wide:flex-col wide:gap-[10px] wide:overflow-y-auto wide:rounded-[22px] wide:bg-atlas-paper wide:p-[12px] wide:shadow-[0px_6px_24px_0px_rgba(28,41,41,0.16)]">
        {/* Header at 12 and switch at 72, stacked so they never overlap when text grows. */}
        <div className="pointer-events-auto absolute left-[12px] right-[12px] top-[calc(12px+env(safe-area-inset-top))] flex flex-col gap-[6px] wide:static wide:shrink-0 wide:gap-[10px]">
          <ContextHeader />
          <PlanSegment active="explore" />
        </div>
        <div className="pointer-events-auto absolute bottom-[var(--atlas-nav-h)] left-0 right-0 wide:static">
          <NextStopSheet />
        </div>
      </div>
      <div className="pointer-events-auto absolute bottom-0 left-0 right-0">
        <AtlasBottomBar active="missions" />
      </div>
    </div>
  );
}
