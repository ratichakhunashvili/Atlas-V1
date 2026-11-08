"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { locationService } from "@/services/location";
import type { GuestPlaceModel } from "@/services/map3d/guest-models";
import { AtlasIcon } from "../asset";
import { AtlasBottomBar } from "../bottom-bar";
import { PlanSegment, StayHeader } from "../missions-chrome";
import { DimensionSwitch } from "./dimension-switch";
import type { MarkerImage } from "./markers";
import { useMapScene, useSceneContext, type ScenePlace } from "./scene";
import { useShortScreen, useWideLayout } from "../use-layout";
import { useSheetSwipe } from "../use-sheet-swipe";
import { categoryLabel } from "@/lib/format";
import { describePriceLevel } from "@/services/advisor/preference-ranking";

/*
 * Main · Missions › Map (home) — Figma frame 1:205 — on real data.
 *
 * Every place here arrives from the server already filtered by services/eligibility for the
 * guest's own active stay (the Atlas catalogue: attractions, Atlas partners and the hotel's own
 * facilities). The server sends every one within 15 km of the hotel (at most MAP_RESULT_CAP)
 * once; moving or zooming the map never removes any from the list. This component only narrows what it was sent, with the chips; it never adds or substitutes anything.
 *
 * The guest's live location comes from the shared geolocation service, which AtlasMap starts when
 * the map opens; this screen only adds the locate control. Not connected yet (shown honestly rather
 * than faked): photos, plan positions and achievement status.
 */

const subscribeLocation = (onChange: () => void) => locationService.onChange(onChange);
const locationSnapshot = () => locationService.getState();

export type LivePlace = {
  id: string;
  name: string;
  description: string | null;
  source: "facility" | "partner" | "attraction";
  category: string;
  address: string | null;
  priceLevel: number | null;
  imageUrl: string | null;
  /** The guest's own hotel recommends this partner. */
  recommended: boolean;
  /** [lng, lat] */
  at: [number, number];
};

export type LiveHotel = { name: string; address: string | null; at: [number, number] };

/** Business chips. Attractions are always shown: choosing "Partners" or "Hotel" never hides them, and guests cannot turn them off. */
type Filter = "All" | "Hotel" | "Partners";

const SHEET_HEIGHT = 196;
/** A picked place's details need a little more room than the card row, so its buttons are in view. */
const DETAILS_HEIGHT = 300;
const SHEET_COLLAPSED = 64;
const MINIMISED = 0;
const CARDS = 1;
const LIST = 2;
type SheetLevel = typeof MINIMISED | typeof CARDS | typeof LIST;
/** The full list stops below the header, Explore / My plan and the filter row. */
const LIST_TOP = "calc(184px + env(safe-area-inset-top) + var(--atlas-nav-h))";

/** The list height in px for this screen, kept current on resize and rotation. */
function useListHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const probe = document.createElement("div");
    probe.style.cssText = `position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;height:calc(100dvh - ${LIST_TOP})`;
    document.body.appendChild(probe);
    const update = () => setHeight(probe.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(probe);
    return () => {
      observer.disconnect();
      probe.remove();
    };
  }, []);
  return height;
}
const TOP = "top-[calc(var(--top)+env(safe-area-inset-top))]";

function marker(place: LivePlace, selected: boolean, visited: boolean): MarkerImage {
  if (place.source === "facility") return selected ? "facility-selected" : "facility";
  // An attraction stays grey until the guest has visited it.
  if (place.source === "attraction") {
    if (visited) return selected ? "attraction-selected" : "attraction";
    return selected ? "attraction-locked-selected" : "attraction-locked";
  }
  if (place.recommended) return selected ? "partner-recommended-selected" : "partner-recommended";
  return selected ? "partner-selected" : "partner";
}

function matches(filter: Filter, place: LivePlace) {
  if (place.source === "attraction") return true;
  return filter === "All" || (filter === "Hotel" ? place.source === "facility" : place.source === "partner");
}

/** Tapping a card (or its marker) flies the map to the place and shows its details in the sheet. */
function LivePlaceCard({ place, selected, hotelName, onOpen }: { place: LivePlace; selected: boolean; hotelName: string; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      id={`live-place-${place.id}`}
      onClick={() => onOpen(place.id)}
      aria-current={selected ? "true" : undefined}
      className={`flex w-[268px] shrink-0 snap-start items-start gap-[10px] rounded-[16px] bg-atlas-paper px-[12px] py-[10px] text-left wide:w-full ${
        selected ? "border-2 border-atlas-teal" : "border border-atlas-beige"
      }`}
    >
      {place.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-entered URLs from any host; next/image would need each host allowlisted
        <img src={place.imageUrl} alt="" loading="lazy" className="size-[56px] shrink-0 rounded-[10px] object-cover" />
      ) : (
        <span aria-hidden className="flex size-[56px] shrink-0 items-center justify-center rounded-[10px] bg-atlas-beige font-grotesk text-[20px] font-bold text-atlas-teal">
          {place.name.replace(/^\[[^\]]*\]\s*/, "").charAt(0)}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col items-start gap-[3px]">
        <span className="font-manrope text-[11px] font-semibold uppercase leading-[15px] tracking-[0.44px] text-atlas-slate">
          {sourceLabel(place)} · {categoryLabel(place.category)}
        </span>
        <span className="w-full font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal [overflow-wrap:anywhere]">
          {place.name}
        </span>
        {place.recommended ? (
          // Teal text for contrast; the bronze dot matches the recommended marker.
          <span className="flex items-center gap-[5px] font-manrope text-[12px] font-semibold leading-[16px] text-atlas-teal">
            <span aria-hidden className="size-[6px] shrink-0 rounded-full bg-atlas-bronze" />
            Recommended by {hotelName}
          </span>
        ) : null}
        <span className="flex w-full flex-wrap items-center gap-[6px]">
          {place.address ? (
            <span className="min-w-0 truncate font-manrope text-[13px] leading-[18px] text-atlas-ink">{place.address}</span>
          ) : null}
          {place.priceLevel ? (
            <span className="rounded-[9px] bg-atlas-beige px-[8px] py-px font-manrope text-[12px] font-semibold leading-[16px] text-atlas-teal">
              {describePriceLevel(place.priceLevel)}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

function sourceLabel(place: LivePlace): string {
  return place.source === "facility" ? "At your hotel" : place.source === "attraction" ? "Attraction" : "Partner";
}

/** One place's details in the sheet, after the guest picked it in the list or on the map. */
function LivePlaceDetails({ place, hotelName, onBack }: { place: LivePlace; hotelName: string; onBack: () => void }) {
  return (
    <div className="flex w-full flex-col items-start gap-[8px]" aria-live="polite">
      <div className="flex w-full items-start gap-[10px]">
        {place.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin-entered URLs from any host; next/image would need each host allowlisted
          <img src={place.imageUrl} alt="" className="size-[64px] shrink-0 rounded-[12px] object-cover" />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col items-start gap-[3px]">
          <p className="font-manrope text-[11px] font-semibold uppercase leading-[15px] tracking-[0.44px] text-atlas-slate">
            {sourceLabel(place)} · {categoryLabel(place.category)}
          </p>
          <h3 className="w-full font-grotesk text-[18px] font-bold leading-[22px] text-atlas-teal [overflow-wrap:anywhere]">{place.name}</h3>
          {place.recommended ? (
            <p className="flex items-center gap-[5px] font-manrope text-[12px] font-semibold leading-[16px] text-atlas-teal">
              <span aria-hidden className="size-[6px] shrink-0 rounded-full bg-atlas-bronze" />
              Recommended by {hotelName}
            </p>
          ) : null}
        </div>
      </div>
      {place.description ? <p className="w-full font-manrope text-[14px] leading-[1.45] text-atlas-ink">{place.description}</p> : null}
      {place.address || place.priceLevel ? (
        <p className="flex w-full flex-wrap items-center gap-[6px] font-manrope text-[13px] leading-[18px] text-atlas-ink">
          {place.address ? <span className="min-w-0">{place.address}</span> : null}
          {place.priceLevel ? (
            <span className="rounded-[9px] bg-atlas-beige px-[8px] py-px text-[12px] font-semibold leading-[16px] text-atlas-teal">
              {describePriceLevel(place.priceLevel)}
            </span>
          ) : null}
        </p>
      ) : null}
      <div className="flex w-full items-center gap-[8px]">
        <Link
          href={`/places/${place.id}`}
          className="flex h-[44px] items-center rounded-[22px] bg-atlas-teal px-[16px] font-manrope text-[14px] font-semibold text-atlas-paper"
        >
          Full details
        </Link>
        <button
          type="button"
          onClick={onBack}
          className="flex h-[44px] items-center rounded-[22px] border border-atlas-beige px-[16px] font-manrope text-[14px] font-semibold text-atlas-ink"
        >
          All places
        </button>
      </div>
    </div>
  );
}

export function LiveMissionsMap({
  hotel,
  places: initialPlaces,
  truncated,
  visitedPlaceIds,
  summary,
  models,
}: {
  hotel: LiveHotel;
  places: LivePlace[];
  truncated: boolean;
  /** Places this guest has visited: their attractions show unlocked. */
  visitedPlaceIds: string[];
  summary: string;
  /** This guest's 3D models (eligible Places only; grey until visited). */
  models: GuestPlaceModel[];
}) {
  const places = initialPlaces;
  const [filter, setFilter] = useState<Filter>("All");
  const visited = new Set(visitedPlaceIds);
  const visible = places.filter((place) => matches(filter, place));
  const [selected, setSelected] = useState<string | null>(places[0]?.id ?? null);
  const short = useShortScreen();
  // The phone sheet rests minimised, as a row of cards, or as a full list ("List" button, or swipe up again).
  const [userLevel, setLevel] = useState<SheetLevel | null>(null);
  const wide = useWideLayout();
  const level: SheetLevel = wide ? CARDS : (userLevel ?? (short ? MINIMISED : CARDS));
  const collapsed = level === MINIMISED;
  const list = level === LIST;
  const setCollapsed = (value: boolean) => setLevel(value ? MINIMISED : CARDS);
  const listHeight = useListHeight();
  // The place whose details the sheet shows. Picking one (a card or its marker) flies the one map to it.
  const [openId, setOpenId] = useState<string | null>(null);
  const open = places.find((place) => place.id === openId && matches(filter, place)) ?? null;
  const restingHeight = open ? DETAILS_HEIGHT : SHEET_HEIGHT;
  const swipe = useSheetSwipe({ level, setLevel: (l) => setLevel(l as SheetLevel), heights: [SHEET_COLLAPSED, restingHeight, Math.max(restingHeight, listHeight)], enabled: !wide });
  // At the top of the list a downward drag moves the sheet; once scrolled, the list scrolls both ways.
  const [listAtTop, setListAtTop] = useState(true);
  const { moveCamera } = useSceneContext();
  const location = useSyncExternalStore(subscribeLocation, locationSnapshot, locationSnapshot);
  const locationBlocked = location.status === "denied" || location.status === "unsupported";
  const wantsCentre = useRef(false);
  // A tap before the first fix asks again, then centres once the position arrives.
  useEffect(() => {
    if (wantsCentre.current && location.coords) {
      wantsCentre.current = false;
      moveCamera("you");
    }
  }, [location.coords, moveCamera]);
  const centreOnMe = () => {
    if (location.coords) moveCamera("you");
    else {
      wantsCentre.current = true;
      locationService.requestOnce();
    }
  };

  const scenePlaces: ScenePlace[] = visible.map((place) => ({
    id: place.id,
    marker: marker(place, place.id === selected, visited.has(place.id)),
    at: place.at,
  }));

  // The page sends every eligible Place within 15 km of the hotel once. Zooming or panning never reloads or
  // drops them, so the list always shows the whole catalogue around the guest's hotel.

  const selectPlace = useCallback(
    (id: string) => {
      const place = places.find((candidate) => candidate.id === id && matches(filter, candidate));
      if (!place) return;
      setSelected(id);
      setOpenId(id);
      setLevel(CARDS);
      moveCamera("place", place.at);
    },
    [places, filter, moveCamera]
  );
  const closeDetails = () => {
    const id = openId;
    setOpenId(null);
    // Back in the list, keep the place just viewed in sight.
    if (id) requestAnimationFrame(() => document.getElementById(`live-place-${id}`)?.scrollIntoView({ block: "nearest", inline: "start" }));
  };

  useMapScene(
    {
      places: scenePlaces,
      hotel: true,
      hotelAt: hotel.at,
      you: false,
      bottomInset: 96 + (collapsed ? SHEET_COLLAPSED : restingHeight),
      allowTilt: true,
      panel: true,
      models,
    },
    selectPlace
  );

  const counts: Record<Filter, number> = {
    All: places.length,
    Hotel: places.filter((place) => place.source === "facility").length,
    Partners: places.filter((place) => place.source === "partner").length,
  };

  const chips = (
    <div role="toolbar" aria-label="Filter places" className="flex min-w-0 flex-1 flex-wrap items-start gap-[6px]">
      {(["All", "Hotel", "Partners"] as const).map((chip) => {
        const active = chip === filter;
        return (
          <button
            key={chip}
            type="button"
            aria-pressed={active}
            onClick={() => {
              setFilter(chip);
              setOpenId(null);
              setSelected(places.find((place) => matches(chip, place))?.id ?? null);
            }}
            className={`flex h-[44px] shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[22px] border px-[12px] font-manrope text-[13px] leading-[18px] ${
              active ? "border-atlas-teal bg-atlas-teal" : "border-atlas-beige bg-atlas-paper"
            }`}
          >
            <span className={`font-semibold ${active ? "text-atlas-paper" : "text-atlas-teal"}`}>{chip}</span>
            <span className={`font-medium ${active ? "text-atlas-paper/75" : "text-atlas-teal/75"}`}>{counts[chip]}</span>
          </button>
        );
      })}
    </div>
  );

  const controls = (
    <>
      {locationBlocked ? (
        <Link
          href="/profile/permissions"
          aria-label="Turn on location"
          className="flex size-[44px] shrink-0 items-center justify-center rounded-[12px] border border-atlas-beige bg-atlas-paper opacity-60"
        >
          <AtlasIcon src="/atlas-ui/icon-locate.svg" size={19} />
        </Link>
      ) : (
        <button
          type="button"
          aria-label={location.status === "locating" && !location.coords ? "Finding your location" : "Centre on my location"}
          onClick={centreOnMe}
          className="flex size-[44px] shrink-0 items-center justify-center rounded-[12px] border border-atlas-beige bg-atlas-paper"
        >
          <AtlasIcon src="/atlas-ui/icon-locate.svg" size={19} />
        </button>
      )}
      <button
        type="button"
        aria-label={`Show ${hotel.name}`}
        onClick={() => moveCamera("hotel")}
        className="flex size-[44px] shrink-0 items-center justify-center rounded-[12px] border border-atlas-beige bg-atlas-paper"
      >
        <AtlasIcon src="/atlas-ui/icon-home-teal-19.svg" size={19} />
      </button>
    </>
  );

  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="contents wide:pointer-events-auto wide:absolute wide:bottom-[16px] wide:left-[16px] wide:top-[calc(16px+env(safe-area-inset-top))] wide:flex wide:w-[var(--atlas-panel-w)] wide:flex-col wide:gap-[10px] wide:overflow-hidden wide:rounded-[22px] wide:bg-atlas-paper wide:p-[12px] wide:shadow-[0px_6px_24px_0px_rgba(28,41,41,0.16)]">
        <div className={`absolute inset-x-0 flex flex-col [--top:12px] ${TOP} wide:static wide:shrink-0 wide:gap-[10px]`}>
          <div className="pointer-events-auto mx-[12px] wide:mx-0">
            <StayHeader hotelName={hotel.name} summary={summary} />
          </div>
          <div className="pointer-events-auto mx-[12px] mt-[6px] wide:mx-0 wide:mt-0">
            <PlanSegment active="explore" />
          </div>
          <div className="pointer-events-auto mt-[8px] flex w-full items-start gap-[6px] px-[12px] wide:mt-0 wide:px-0">
            {chips}
            <DimensionSwitch />
          </div>
          <div className="pointer-events-auto mr-[12px] mt-[8px] flex flex-col items-start gap-[6px] self-end [@media(max-height:700px)]:flex-row wide:hidden">
            {controls}
          </div>
        </div>

        <section
          aria-label="Places"
          {...swipe.handlers}
          className={`pointer-events-auto absolute left-0 right-0 flex touch-pan-x flex-col items-center gap-[8px] overflow-hidden rounded-t-[22px] bg-atlas-paper pt-[8px] shadow-[0px_-4px_18px_0px_rgba(28,41,41,0.1)] ${swipe.dragging ? "" : "motion-safe:transition-[height] motion-safe:duration-200"} wide:touch-auto wide:static wide:h-auto! wide:min-h-0 wide:flex-1 wide:rounded-none wide:pt-0 wide:shadow-none`}
          style={{ bottom: "var(--atlas-nav-h)", height: swipe.height }}
        >
          <div aria-hidden className="h-[4px] w-[36px] shrink-0 rounded-[2px] bg-atlas-beige wide:hidden" />
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls="live-place-cards"
            onClick={() => setCollapsed(!collapsed)}
            className="absolute left-1/2 top-0 h-[24px] w-[72px] -translate-x-1/2 rounded-b-[12px] wide:hidden"
          >
            <span className="sr-only">{collapsed ? "Show places" : "Hide places to see more of the map"}</span>
          </button>
          <div className="flex min-h-[44px] w-full shrink-0 items-center justify-between pl-[16px] pr-[12px] wide:px-[4px]">
            <div className="flex min-w-0 flex-col">
              <h2 className="font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal">
                {visible.length} {visible.length === 1 ? "place" : "places"} within 15 km
              </h2>
              {truncated ? (
                <p role="status" className="font-manrope text-[12px] leading-[16px] text-atlas-slate">
                  Showing the nearest places to your hotel.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              aria-pressed={list}
              onClick={() => setLevel(list ? CARDS : LIST)}
              className="flex h-[44px] shrink-0 items-center gap-[6px] rounded-[22px] border border-atlas-beige px-[12px] font-manrope text-[13px] font-semibold leading-[18px] text-atlas-ink wide:hidden"
            >
              <AtlasIcon src={list ? "/atlas-ui/icon-map-teal.svg" : "/atlas-ui/icon-list-ink.svg"} size={16} />
              {list ? "Map" : "List"}
            </button>
          </div>
          <div
            id="live-place-cards"
            hidden={collapsed && !swipe.dragging}
            onScroll={list ? (event) => setListAtTop(event.currentTarget.scrollTop <= 0) : undefined}
            className={`flex w-full items-start gap-[10px] px-[16px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
              open
                ? "min-h-0 flex-1 flex-col overflow-y-auto pb-[12px]"
                : list || (swipe.dragging && swipe.height > SHEET_HEIGHT) ? `min-h-0 flex-1 flex-col overflow-y-auto pb-[12px] [&>*]:w-full ${listAtTop ? "touch-pan-down" : "touch-pan-y"}` : "atlas-scroll-fade snap-x overflow-x-auto scroll-px-[16px] pb-[6px]"
            } wide:min-h-0 wide:flex-1 wide:snap-none wide:flex-col wide:overflow-y-auto wide:overflow-x-hidden wide:px-[4px] wide:[mask-image:none] wide:[scrollbar-width:thin]`}
          >
            {open ? (
              <LivePlaceDetails place={open} hotelName={hotel.name} onBack={closeDetails} />
            ) : visible.length === 0 ? (
              <p className="w-full font-manrope text-[14px] leading-[1.45] text-atlas-slate">
                {places.length === 0
                  ? "Nothing to show in this part of the map. Move the map or zoom out to see more."
                  : "Nothing in this group. Try another filter."}
              </p>
            ) : (
              visible.map((place) => (
                <LivePlaceCard key={place.id} place={place} selected={place.id === selected} hotelName={hotel.name} onOpen={selectPlace} />
              ))
            )}
          </div>
        </section>
      </div>

      <div className={`pointer-events-auto absolute right-[16px] hidden flex-col items-start gap-[6px] [--top:16px] ${TOP} wide:flex`}>{controls}</div>

      <div className="pointer-events-auto absolute bottom-0 left-0 right-0">
        <AtlasBottomBar active="missions" />
      </div>
    </div>
  );
}
