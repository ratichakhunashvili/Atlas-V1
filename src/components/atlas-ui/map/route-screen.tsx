"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AtlasIcon } from "../asset";
import { CheckInLink } from "../demo/check-in-link";
import { addStop } from "../demo/demo-store";
import { placeStatus, useLivePlan } from "../demo/live";
import { PLACES, ROUTES, type RouteId } from "../fixtures";
import { screenHref } from "../screen-hrefs";
import { AtlasLink } from "../ui";
import { useMapScene, useSceneContext } from "./scene";

/*
 * Route · Walking route — Figma frame 1:731, and its RouteP1 (2041), RouteP4 (2088) and RouteA1
 * (2133) variants. The walking line is a real Mapbox walking route from Hotel A, kept as a
 * fixture; the sheet's times, distances and steps are the design's copy. The action at the
 * bottom follows the stop's status in the demo plan: check in when it is planned, add it when it
 * is not, and a note once it is done.
 *
 * Phone: a bottom sheet. Wide: the same content in a side panel, so the map stays visible.
 */

const SHEET_HEIGHT = 339; // 844 - 505

const STEP_ICONS = {
  up: "/atlas-ui/icon-up.svg",
  turn: "/atlas-ui/icon-turn.svg",
  pin: "/atlas-ui/icon-pin-teal-22.svg",
} as const;

const ACTION = "flex h-[52px] w-full shrink-0 items-center justify-center gap-[8px] rounded-[14px] font-manrope text-[16px] font-semibold leading-[22px]";

function RouteAction({ route }: { route: RouteId }) {
  const router = useRouter();
  const live = useLivePlan();
  const destination = PLACES[ROUTES[route].destination];
  const status = placeStatus(live, destination.id);
  const attraction = destination.kind === "attraction";

  if (status === "done") {
    return (
      <p className={`${ACTION} bg-atlas-sand text-atlas-ink`}>
        <AtlasIcon src="/atlas-ui/icon-qr-ink-19.svg" size={19} />
        You checked in here today
      </p>
    );
  }
  if (status === "not-planned") {
    return (
      <button
        type="button"
        onClick={() => {
          addStop(destination.id, `Added ${destination.name} to your plan`);
          router.push(screenHref("MyPlan") ?? "/plan");
        }}
        className={`${ACTION} bg-atlas-teal text-atlas-paper`}
      >
        Add to my plan to check in
      </button>
    );
  }
  return (
    <CheckInLink stop={destination.id} className={`${ACTION} bg-atlas-teal text-atlas-paper`}>
      <AtlasIcon src={attraction ? "/atlas-ui/icon-camera-light-19.svg" : "/atlas-ui/icon-qr-light-19.svg"} size={19} />
      {attraction ? "I'm here — open camera view" : "I'm here — check in"}
    </CheckInLink>
  );
}

export function RouteScreen({ route }: { route: RouteId }) {
  const fixture = ROUTES[route];
  const destination = PLACES[fixture.destination];
  const [following, setFollowing] = useState(true);
  const { moveCamera } = useSceneContext();

  useMapScene({
    places: [{ id: destination.id, marker: destination.kind === "attraction" ? "attraction-selected" : "route-destination" }],
    hotel: false,
    you: false,
    route,
    bottomInset: SHEET_HEIGHT,
    allowTilt: false,
    panel: true,
  });

  const toggleFollow = () => {
    if (!following) moveCamera("you");
    setFollowing(!following);
  };

  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="contents wide:pointer-events-auto wide:absolute wide:bottom-[16px] wide:left-[16px] wide:top-[calc(16px+env(safe-area-inset-top))] wide:flex wide:w-[var(--atlas-panel-w)] wide:flex-col wide:gap-[12px] wide:overflow-y-auto wide:rounded-[22px] wide:bg-atlas-paper wide:p-[12px] wide:shadow-[0px_6px_24px_0px_rgba(28,41,41,0.16)]">
        <div className="atlas-dark pointer-events-auto absolute left-[16px] right-[16px] top-[calc(16px+env(safe-area-inset-top))] flex items-center gap-[12px] rounded-[16px] bg-atlas-teal px-[14px] py-[12px] wide:static wide:shrink-0">
          <AtlasLink
            to={fixture.endTo}
            label="End route"
            className="flex size-[44px] shrink-0 items-center justify-center rounded-[12px] bg-atlas-paper/15"
          >
            <AtlasIcon src="/atlas-ui/icon-close-light.svg" size={20} />
          </AtlasLink>
          <div className="flex min-w-0 flex-col items-start gap-[2px]">
            <p className="font-manrope text-[12px] leading-[16px] text-atlas-beige">Walking to</p>
            <h1 className="font-grotesk text-[18px] font-bold leading-[23px] text-atlas-paper">{destination.name}</h1>
          </div>
        </div>

        <section
          aria-label="Walking directions"
          className="pointer-events-auto absolute bottom-0 left-0 right-0 flex max-h-[calc(100dvh-96px)] flex-col items-center gap-[14px] overflow-y-auto rounded-t-[24px] bg-atlas-paper px-[16px] pb-[calc(24px+env(safe-area-inset-bottom))] pt-[10px] drop-shadow-[0px_-4px_10px_rgba(28,41,41,0.12)] wide:static wide:max-h-none wide:overflow-visible wide:rounded-none wide:px-[4px] wide:pb-[4px] wide:pt-0 wide:drop-shadow-none"
        >
          <div aria-hidden className="h-[4px] w-[36px] shrink-0 rounded-[2px] bg-atlas-beige wide:hidden" />
          <div className="flex w-full flex-wrap items-end gap-x-[10px]">
            <p className="font-grotesk text-[26px] font-bold leading-[33px] text-atlas-teal">{fixture.minutes}</p>
            <p className="font-manrope text-[14px] leading-[19px] text-atlas-slate">{fixture.summary}</p>
          </div>
          <ol className="flex w-full flex-col items-start">
            {fixture.steps.map((step, index) => (
              <li
                key={step.text}
                className={`flex min-h-[48px] w-full items-center gap-[12px] ${index < fixture.steps.length - 1 ? "border-b border-atlas-beige" : ""}`}
              >
                <AtlasIcon src={STEP_ICONS[step.icon]} size={22} className="shrink-0" />
                <p className={`min-w-0 flex-1 font-manrope text-[15px] leading-[20px] text-atlas-ink ${step.emphasis ? "font-semibold" : ""}`}>
                  {step.text}
                </p>
                <p className="shrink-0 font-manrope text-[13px] leading-[18px] text-atlas-slate">{step.distance}</p>
              </li>
            ))}
          </ol>
          <RouteAction route={route} />
          <p className="w-full text-center font-manrope text-[12px] leading-[16px] text-atlas-slate">
            Walking route by Mapbox. Check the street as you go.
          </p>
        </section>
      </div>

      <button
        type="button"
        aria-pressed={following}
        aria-label="Follow my location"
        onClick={toggleFollow}
        className={`pointer-events-auto absolute right-[16px] top-[calc(100px+env(safe-area-inset-top))] flex size-[44px] items-center justify-center rounded-[12px] border border-atlas-beige wide:top-[calc(16px+env(safe-area-inset-top))] ${
          following ? "bg-atlas-teal" : "bg-atlas-paper"
        }`}
      >
        <AtlasIcon src={following ? "/atlas-ui/icon-locate-light-20.svg" : "/atlas-ui/icon-locate.svg"} size={following ? 20 : 19} />
      </button>
    </div>
  );
}
