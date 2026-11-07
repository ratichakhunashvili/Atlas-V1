"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { locationService } from "@/services/location";
import { AtlasIcon } from "../asset";
import { AtlasBottomBar } from "../bottom-bar";
import { PlanSegment, StayHeader } from "../missions-chrome";
import { DimensionSwitch } from "./dimension-switch";
import type { MarkerImage } from "./markers";
import { useMapScene, useMapViewport, useSceneContext, type MapViewport, type ScenePlace } from "./scene";
import { useShortScreen, useWideLayout } from "../use-layout";
import { useSheetSwipe } from "../use-sheet-swipe";
import { categoryLabel } from "@/lib/format";
import { describePriceLevel } from "@/services/advisor/preference-ranking";

/*
 * Main · Missions › Map (home) — Figma frame 1:205 — on real data.
 *
 * Every place here arrives from the server already filtered by services/eligibility for the
 * guest's own active stay (the Atlas catalogue: attractions, Atlas partners and the hotel's own
 * facilities). The server sends only the places inside the visible map area, at most
 * MAP_RESULT_CAP of them; moving the map asks /api/places/viewport for the new area. This
 * component only narrows what it was sent, with the chips; it never adds or substitutes anything.
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

/** Business chips. Attractions have their own toggle, so choosing "Partners" or "Hotel" never hides them. */
type Filter = "All" | "Hotel" | "Partners";

/** How long the map must rest before the new area is fetched. */
const VIEWPORT_DEBOUNCE_MS = 250;

type ViewportResponse = { places: (Omit<LivePlace, "at"> & { latitude: number; longitude: number })[]; truncated: boolean };

/** Rounded to ~10 m so a tiny nudge of the map doesn't refetch the same area. */
function viewportKey(viewport: MapViewport): string {
  return [viewport.south, viewport.west, viewport.north, viewport.east].map((value) => value.toFixed(4)).join(",");
}

const SHEET_HEIGHT = 196;
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

function matches(filter: Filter, attractions: boolean, place: LivePlace) {
  if (place.source === "attraction") return attractions;
  return filter === "All" || (filter === "Hotel" ? place.source === "facility" : place.source === "partner");
}

/** A card opens the place's details; tapping its marker on the map highlights it and scrolls it into view. */
function LivePlaceCard({ place, selected, hotelName }: { place: LivePlace; selected: boolean; hotelName: string }) {
  return (
    <Link
      id={`live-place-${place.id}`}
      href={`/places/${place.id}`}
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
          {place.source === "facility" ? "At your hotel" : place.source === "attraction" ? "Attraction" : "Partner"} · {categoryLabel(place.category)}
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
    </Link>
  );
}

export function LiveMissionsMap({
  hotel,
  places: initialPlaces,
  truncated: initialTruncated,
  visitedPlaceIds,
  summary,
}: {
  hotel: LiveHotel;
  places: LivePlace[];
  truncated: boolean;
  /** Places this guest has visited: their attractions show unlocked. */
  visitedPlaceIds: string[];
  summary: string;
}) {
  const [places, setPlaces] = useState(initialPlaces);
  const [truncated, setTruncated] = useState(initialTruncated);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("All");
  const [attractions, setAttractions] = useState(true);
  const visited = new Set(visitedPlaceIds);
  const visible = places.filter((place) => matches(filter, attractions, place));
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
  const swipe = useSheetSwipe({ level, setLevel: (l) => setLevel(l as SheetLevel), heights: [SHEET_COLLAPSED, SHEET_HEIGHT, Math.max(SHEET_HEIGHT, listHeight)], enabled: !wide });
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

  // Load the catalogue Places for the area the guest is looking at, once the map comes to rest. A newer move
  // cancels the older request, so a slow answer never overwrites the current area.
  const lastKey = useRef<string | null>(null);
  const pending = useRef<{ timer: ReturnType<typeof setTimeout> | null; controller: AbortController | null }>({ timer: null, controller: null });
  const onViewport = useCallback((viewport: MapViewport) => {
    const key = viewportKey(viewport);
    if (key === lastKey.current) return;
    if (pending.current.timer) clearTimeout(pending.current.timer);
    pending.current.timer = setTimeout(async () => {
      pending.current.controller?.abort();
      const controller = new AbortController();
      pending.current.controller = controller;
      const query = new URLSearchParams({
        south: String(viewport.south),
        west: String(viewport.west),
        north: String(viewport.north),
        east: String(viewport.east),
      });
      try {
        const response = await fetch(`/api/places/viewport?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Places request failed (${response.status})`);
        const body = (await response.json()) as ViewportResponse;
        lastKey.current = key;
        setPlaces(body.places.map(({ latitude, longitude, ...place }) => ({ ...place, at: [longitude, latitude] as [number, number] })));
        setTruncated(body.truncated);
        setLoadFailed(false);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error(error);
        setLoadFailed(true);
      }
    }, VIEWPORT_DEBOUNCE_MS);
  }, []);
  useEffect(() => {
    const current = pending.current;
    return () => {
      if (current.timer) clearTimeout(current.timer);
      current.controller?.abort();
    };
  }, []);
  useMapViewport(onViewport);

  const selectPlace = useCallback(
    (id: string) => {
      if (places.some((place) => place.id === id && matches(filter, attractions, place))) {
        setSelected(id);
        setCollapsed(false);
        // After the sheet opens, bring this place's card into view so the tap visibly answers.
        requestAnimationFrame(() =>
          document.getElementById(`live-place-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" })
        );
      }
    },
    [places, filter, attractions]
  );

  useMapScene(
    {
      places: scenePlaces,
      hotel: true,
      hotelAt: hotel.at,
      you: false,
      bottomInset: 96 + (collapsed ? SHEET_COLLAPSED : SHEET_HEIGHT),
      allowTilt: true,
      panel: true,
    },
    selectPlace
  );

  const counts: Record<Filter, number> = {
    All: places.filter((place) => place.source !== "attraction").length,
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
              setSelected(places.find((place) => matches(chip, attractions, place))?.id ?? null);
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
      <button
        type="button"
        aria-pressed={attractions}
        onClick={() => setAttractions(!attractions)}
        className={`flex h-[44px] shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[22px] border px-[12px] font-manrope text-[13px] leading-[18px] ${
          attractions ? "border-atlas-teal bg-atlas-teal" : "border-atlas-beige bg-atlas-paper"
        }`}
      >
        <span className={`font-semibold ${attractions ? "text-atlas-paper" : "text-atlas-teal"}`}>Attractions</span>
        <span className={`font-medium ${attractions ? "text-atlas-paper/75" : "text-atlas-teal/75"}`}>
          {places.filter((place) => place.source === "attraction").length}
        </span>
      </button>
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
                {visible.length} {visible.length === 1 ? "place" : "places"} in this area
              </h2>
              {loadFailed || truncated ? (
                <p role="status" className="font-manrope text-[12px] leading-[16px] text-atlas-slate">
                  {loadFailed ? "Couldn't update the places. Move the map to try again." : "Zoom in to see every place here."}
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
              list || (swipe.dragging && swipe.height > SHEET_HEIGHT) ? `min-h-0 flex-1 flex-col overflow-y-auto pb-[12px] [&>*]:w-full ${listAtTop ? "touch-pan-down" : "touch-pan-y"}` : "atlas-scroll-fade snap-x overflow-x-auto scroll-px-[16px] pb-[6px]"
            } wide:min-h-0 wide:flex-1 wide:snap-none wide:flex-col wide:overflow-y-auto wide:overflow-x-hidden wide:px-[4px] wide:[mask-image:none] wide:[scrollbar-width:thin]`}
          >
            {visible.length === 0 ? (
              <p className="w-full font-manrope text-[14px] leading-[1.45] text-atlas-slate">
                {places.length === 0
                  ? "Nothing to show in this part of the map. Move the map or zoom out to see more."
                  : "Nothing in this group. Try another filter."}
              </p>
            ) : (
              visible.map((place) => (
                <LivePlaceCard key={place.id} place={place} selected={place.id === selected} hotelName={hotel.name} />
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
