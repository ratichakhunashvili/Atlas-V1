"use client";

import { useCallback, useEffect, useState } from "react";
import { AtlasIcon } from "../asset";
import { AtlasBottomBar } from "../bottom-bar";
import { achievementLabel, planLabel, useLivePlan } from "../demo/live";
import { FILTER_PLACES, PLACES, orderedCards, type MapFilter, type PlaceId } from "../fixtures";
import { FilterChips } from "../filter-chips";
import { ContextHeader, PlanSegment } from "../missions-chrome";
import { PlaceCard } from "../place-card";
import { AtlasLink } from "../ui";
import type { MarkerImage } from "./markers";
import { useMapScene, useSceneContext, type ScenePlace } from "./scene";
import { useShortScreen } from "../use-layout";

/*
 * Main · Missions › Map (home) — Figma frame 1:205, with the Map layer component set (1:2926):
 * five filter chips, six places, and the place sheet. Chips filter, markers select a place,
 * cards open its details. The map controls toggle 2D / 3D and centre on the guest or the hotel,
 * showing the two toasts from frames 1:5054 and 1:5059. With location off (frame 70:4761) a
 * banner under the chips says the map is showing places around the hotel instead, with a link
 * to Permissions; there is no "you" dot, and the locate control opens Permissions too.
 *
 * Phone layout: geometry is anchored to the screen edges — header, switch, chips and controls
 * to the top, sheet and bar to the bottom — so a 390 x 844 screen is exactly the design. The
 * sheet's handle collapses it to show more of the map. Wide layout: header, chips and places
 * stack in a side panel; the controls and toasts stay on the map.
 */

const SHEET_HEIGHT = 196;
const SHEET_COLLAPSED = 64;

function markerFor(id: PlaceId, selected: boolean): MarkerImage {
  const kind = PLACES[id].kind;
  if (kind === "attraction") return selected ? "attraction-selected" : "attraction";
  if (kind === "facility") return selected ? "facility-selected" : "facility";
  return selected ? "partner-selected" : "partner";
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-[44px] shrink-0 items-center justify-center rounded-[12px] border border-atlas-beige bg-atlas-paper"
    >
      {children}
    </button>
  );
}

export type MapToastKind = "you" | "hotel";

const TOAST_TEXT: Record<MapToastKind, string> = {
  you: "Centred on your location",
  hotel: "Centred on Hotel A",
};

/** Above the sheet on phones (design: 304 from the bottom of an 844 frame), over the map when wide. */
export function MapToast({ kind, collapsed = false }: { kind: MapToastKind; collapsed?: boolean }) {
  return (
    <div
      role="status"
      className="pointer-events-auto absolute left-[12px] right-[12px] flex h-[44px] items-center gap-[8px] rounded-[14px] bg-atlas-ink px-[14px] drop-shadow-[0px_6px_9px_rgba(28,41,41,0.3)] wide:bottom-[16px]! wide:left-[calc(var(--atlas-panel-w)+32px)] wide:right-auto wide:w-[320px]"
      style={{ bottom: `calc(var(--atlas-nav-h) + ${(collapsed ? SHEET_COLLAPSED : SHEET_HEIGHT) + 12}px)` }}
    >
      <AtlasIcon src="/atlas-ui/icon-locate-light-18.svg" size={18} />
      <p className="font-manrope text-[14px] leading-[19px] text-atlas-paper">{TOAST_TEXT[kind]}</p>
    </div>
  );
}

/** Top offsets clear the status bar on notched phones; env() is 0 everywhere else. */
const TOP = "top-[calc(var(--top)+env(safe-area-inset-top))]";

/**
 * Location banner (70:3980): beside the map controls on phones, in the side panel when wide. On
 * short screens it takes its own row above the controls; on very narrow ones (200% zoom) it shrinks
 * to one line, "Location off · Turn on", with the full sentence kept for screen readers, so the
 * controls under it stay clear of the place sheet.
 */
function LocationOffBanner() {
  return (
    <div role="status" className="flex min-w-0 flex-1 items-center gap-[10px] rounded-[14px] bg-atlas-sand pl-[12px] pr-[8px] wide:flex-none">
      <AtlasIcon src="/atlas-ui/icon-pin-ink-18.svg" size={18} className="shrink-0 [@media(max-width:300px)]:hidden" />
      <p className="min-w-0 flex-1 py-[10px] font-manrope text-[13px] leading-[1.4] text-atlas-ink">
        <span className="[@media(max-width:300px)]:sr-only">Location is off. Showing places around Hotel A.</span>
        <span aria-hidden className="hidden whitespace-nowrap [@media(max-width:300px)]:inline">
          Location off
        </span>
      </p>
      <AtlasLink
        to="Permissions"
        className="flex h-[44px] shrink-0 items-center px-[4px] font-manrope text-[13px] font-semibold leading-[18px] text-atlas-teal"
      >
        Turn on
      </AtlasLink>
    </div>
  );
}

export function MissionsMap({ initialToast, locationOff = false }: { initialToast?: MapToastKind; locationOff?: boolean }) {
  const [filter, setFilter] = useState<MapFilter>("All");
  const [selected, setSelected] = useState<PlaceId>("partner-2");
  const [toast, setToast] = useState<MapToastKind | null>(initialToast ?? null);
  // On very short screens the sheet starts collapsed so the map and its controls stay visible.
  const short = useShortScreen();
  const [userCollapsed, setCollapsed] = useState<boolean | null>(null);
  const collapsed = userCollapsed ?? short;
  const { moveCamera, dimension, setDimension } = useSceneContext();
  const live = useLivePlan();

  const visible = FILTER_PLACES[filter].places;
  const places: ScenePlace[] = visible.map((id) => ({ id, marker: markerFor(id, id === selected) }));

  const selectPlace = useCallback(
    (id: PlaceId) => {
      if (FILTER_PLACES[filter].places.includes(id)) {
        setSelected(id);
        setCollapsed(false);
      }
    },
    [filter]
  );

  useMapScene(
    { places, hotel: true, you: !locationOff, bottomInset: 96 + (collapsed ? SHEET_COLLAPSED : SHEET_HEIGHT), allowTilt: true, panel: true },
    selectPlace
  );

  // A shown toast clears itself, like a system toast.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  // Review routes that open on a toast start centred where that toast says.
  useEffect(() => {
    if (initialToast) moveCamera(initialToast);
    else if (locationOff) moveCamera("hotel");
  }, [initialToast, locationOff, moveCamera]);

  const changeFilter = (next: MapFilter) => {
    setFilter(next);
    setSelected(FILTER_PLACES[next].firstSelected);
  };

  const centre = (target: MapToastKind) => {
    moveCamera(target);
    setToast(target);
  };

  const cards = orderedCards(filter, selected);
  const count = cards.length;

  const controls = (
    <>
      <button
        type="button"
        aria-label={dimension === "3D" ? "Show a flat 2D map" : "Show a tilted 3D map"}
        onClick={() => setDimension(dimension === "3D" ? "2D" : "3D")}
        className="flex size-[44px] shrink-0 items-center justify-center rounded-[12px] border border-atlas-beige bg-atlas-paper font-grotesk text-[13px] font-bold leading-[17px] text-atlas-teal"
      >
        {dimension === "3D" ? "2D" : "3D"}
      </button>
      {locationOff ? (
        <AtlasLink
          to="Permissions"
          label="Turn on location"
          className="flex size-[44px] shrink-0 items-center justify-center rounded-[12px] border border-atlas-beige bg-atlas-paper"
        >
          <AtlasIcon src="/atlas-ui/icon-locate.svg" size={19} />
        </AtlasLink>
      ) : (
        <ControlButton label="Centre on my location" onClick={() => centre("you")}>
          <AtlasIcon src="/atlas-ui/icon-locate.svg" size={19} />
        </ControlButton>
      )}
      <ControlButton label="Show Hotel A" onClick={() => centre("hotel")}>
        <AtlasIcon src="/atlas-ui/icon-home-teal-19.svg" size={19} />
      </ControlButton>
    </>
  );

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Phone: these sit at their design positions. Wide: they stack in the side panel. */}
      <div className="contents wide:pointer-events-auto wide:absolute wide:bottom-[16px] wide:left-[16px] wide:top-[calc(16px+env(safe-area-inset-top))] wide:flex wide:w-[var(--atlas-panel-w)] wide:flex-col wide:gap-[10px] wide:overflow-hidden wide:rounded-[22px] wide:bg-atlas-paper wide:p-[12px] wide:shadow-[0px_6px_24px_0px_rgba(28,41,41,0.16)]">
        {/*
         * Phone: one column from the top edge, spaced as the design places them (header at 12,
         * switch at 72, chips at 128, controls at 180 on a 390 x 844 screen). Stacking keeps them
         * apart when text grows, instead of fixed offsets that overlap.
         */}
        <div className={`absolute inset-x-0 flex flex-col [--top:12px] ${TOP} wide:static wide:shrink-0 wide:gap-[10px]`}>
          <div className="pointer-events-auto mx-[12px] wide:mx-0">
            <ContextHeader />
          </div>
          <div className="pointer-events-auto mx-[12px] mt-[6px] wide:mx-0 wide:mt-0">
            <PlanSegment active="explore" />
          </div>
          <div className="pointer-events-auto mt-[8px] wide:mt-0">
            <FilterChips filter={filter} onChange={changeFilter} className="px-[12px] wide:px-0" />
          </div>
          <div
            className={`mx-[12px] mt-[8px] flex items-start gap-[10px] [@media(max-height:700px)]:flex-col [@media(max-height:700px)]:items-stretch [@media(max-height:700px)]:gap-[8px] [@media(max-width:300px)]:mt-[4px] [@media(max-width:300px)]:gap-[4px] wide:mx-0 wide:mt-0 wide:flex-row ${locationOff ? "" : "wide:hidden"}`}
          >
            {locationOff ? (
              <div className="pointer-events-auto flex min-w-0 flex-1">
                <LocationOffBanner />
              </div>
            ) : null}
            <div className="pointer-events-auto ml-auto flex flex-col items-start gap-[6px] [@media(max-height:700px)]:flex-row [@media(max-width:300px)]:ml-0 wide:hidden">
              {controls}
            </div>
          </div>
        </div>

        <section
          aria-label="Places"
          className="pointer-events-auto absolute left-0 right-0 flex flex-col items-center gap-[8px] overflow-hidden rounded-t-[22px] bg-atlas-paper pt-[8px] shadow-[0px_-4px_18px_0px_rgba(28,41,41,0.1)] wide:static wide:h-auto! wide:min-h-0 wide:flex-1 wide:rounded-none wide:pt-0 wide:shadow-none"
          style={{ bottom: "var(--atlas-nav-h)", height: collapsed ? SHEET_COLLAPSED : SHEET_HEIGHT }}
        >
          <div aria-hidden className="h-[4px] w-[36px] shrink-0 rounded-[2px] bg-atlas-beige wide:hidden" />
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls="map-place-cards"
            onClick={() => setCollapsed(!collapsed)}
            className="absolute left-1/2 top-0 h-[24px] w-[72px] -translate-x-1/2 rounded-b-[12px] wide:hidden"
          >
            <span className="sr-only">{collapsed ? "Show places" : "Hide places to see more of the map"}</span>
          </button>
          <div className="flex w-full shrink-0 items-center justify-between pl-[16px] pr-[12px] wide:px-[4px]">
            <h2 className="font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal">
              {count} {count === 1 ? "place" : "places"} for you
            </h2>
            <AtlasLink
              to="List"
              className="flex h-[44px] items-center gap-[6px] rounded-[22px] border border-atlas-beige px-[12px] font-manrope text-[13px] font-semibold leading-[18px] text-atlas-ink"
            >
              <AtlasIcon src="/atlas-ui/icon-list-ink.svg" size={16} />
              List
            </AtlasLink>
          </div>
          <div
            id="map-place-cards"
            key={`${filter}-${selected}`}
            hidden={collapsed}
            className="atlas-scroll-fade flex w-full snap-x items-start gap-[10px] overflow-x-auto scroll-px-[16px] px-[16px] pb-[6px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden wide:min-h-0 wide:flex-1 wide:snap-none wide:flex-col wide:overflow-y-auto wide:overflow-x-hidden wide:px-[4px] wide:[mask-image:none] wide:[scrollbar-width:thin]"
          >
            {cards.map((id) => (
              <PlaceCard
                key={id}
                place={PLACES[id]}
                selected={id === selected}
                planLabel={planLabel(live, id)}
                achievement={achievementLabel(live, id)}
              />
            ))}
          </div>
        </section>
      </div>

      {/* Wide layout: the controls float over the map, right of the panel. */}
      <div className={`pointer-events-auto absolute right-[16px] hidden flex-col items-start gap-[6px] [--top:16px] ${TOP} wide:flex`}>{controls}</div>

      {toast ? <MapToast kind={toast} collapsed={collapsed} /> : null}

      <div className="pointer-events-auto absolute bottom-0 left-0 right-0">
        <AtlasBottomBar active="missions" />
      </div>
    </div>
  );
}
