"use client";

import { useCallback, useState } from "react";
import { AtlasIcon } from "../asset";
import { AtlasBottomBar } from "../bottom-bar";
import { PlanSegment } from "../missions-chrome";
import type { MarkerImage } from "./markers";
import { useMapScene, useSceneContext, type ScenePlace } from "./scene";
import { useShortScreen } from "../use-layout";

/*
 * Main · Missions › Map (home) — Figma frame 1:205 — on real data.
 *
 * Every place here arrives from the server already filtered by services/eligibility for the
 * guest's own active stay: the hotel's active facilities and the partners it has explicitly
 * approved. This component never adds, widens or substitutes anything. With nothing approved it
 * says so instead of showing other places.
 *
 * Not connected yet (shown honestly rather than faked): the guest's live location, photos, plan
 * positions and achievement status. The "you" dot and the locate control are left out until the
 * shared geolocation service is wired in.
 */

export type LivePlace = {
  id: string;
  name: string;
  source: "facility" | "partner";
  category: string;
  address: string | null;
  priceLevel: number | null;
  /** [lng, lat] */
  at: [number, number];
};

export type LiveHotel = { name: string; address: string | null; at: [number, number] };

type Filter = "All" | "Hotel" | "Partners";

const SHEET_HEIGHT = 196;
const SHEET_COLLAPSED = 64;
const PRICE_LEVELS: Record<number, string> = { 1: "Budget", 2: "Moderate", 3: "Luxury" };
const TOP = "top-[calc(var(--top)+env(safe-area-inset-top))]";

function label(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

function marker(place: LivePlace, selected: boolean): MarkerImage {
  if (place.source === "facility") return selected ? "facility-selected" : "facility";
  return selected ? "partner-selected" : "partner";
}

function matches(filter: Filter, place: LivePlace) {
  return filter === "All" || (filter === "Hotel" ? place.source === "facility" : place.source === "partner");
}

function LivePlaceCard({ place, selected, onSelect }: { place: LivePlace; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex w-[268px] shrink-0 snap-start items-start gap-[10px] rounded-[16px] bg-atlas-paper px-[12px] py-[10px] text-left wide:w-full ${
        selected ? "border-2 border-atlas-teal" : "border border-atlas-beige"
      }`}
    >
      <span
        aria-hidden
        className="flex size-[56px] shrink-0 items-center justify-center rounded-[10px] bg-atlas-beige font-manrope text-[10px] leading-[14px] text-atlas-ink"
      >
        Photo
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-[3px]">
        <span className="font-manrope text-[11px] font-semibold uppercase leading-[15px] tracking-[0.44px] text-atlas-slate">
          {place.source === "facility" ? "At your hotel" : "Partner"} · {label(place.category)}
        </span>
        <span className="w-full font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal [overflow-wrap:anywhere]">
          {place.name}
        </span>
        <span className="flex w-full flex-wrap items-center gap-[6px]">
          {place.address ? (
            <span className="min-w-0 truncate font-manrope text-[13px] leading-[18px] text-atlas-ink">{place.address}</span>
          ) : null}
          {place.priceLevel ? (
            <span className="rounded-[9px] bg-atlas-beige px-[8px] py-px font-manrope text-[12px] font-semibold leading-[16px] text-atlas-teal">
              {PRICE_LEVELS[place.priceLevel]}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

export function LiveMissionsMap({ hotel, places }: { hotel: LiveHotel; places: LivePlace[] }) {
  const [filter, setFilter] = useState<Filter>("All");
  const visible = places.filter((place) => matches(filter, place));
  const [selected, setSelected] = useState<string | null>(places[0]?.id ?? null);
  const short = useShortScreen();
  const [userCollapsed, setCollapsed] = useState<boolean | null>(null);
  const collapsed = userCollapsed ?? short;
  const { moveCamera, dimension, setDimension } = useSceneContext();

  const scenePlaces: ScenePlace[] = visible.map((place) => ({ id: place.id, marker: marker(place, place.id === selected), at: place.at }));

  const selectPlace = useCallback(
    (id: string) => {
      if (places.some((place) => place.id === id && matches(filter, place))) {
        setSelected(id);
        setCollapsed(false);
      }
    },
    [places, filter]
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
    All: places.length,
    Hotel: places.filter((place) => place.source === "facility").length,
    Partners: places.filter((place) => place.source === "partner").length,
  };

  const chips = (
    <div role="toolbar" aria-label="Filter places" className="flex w-full flex-wrap items-start gap-[6px] px-[12px] wide:px-0">
      {(["All", "Hotel", "Partners"] as const).map((chip) => {
        const active = chip === filter;
        return (
          <button
            key={chip}
            type="button"
            aria-pressed={active}
            onClick={() => {
              setFilter(chip);
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
      <button
        type="button"
        aria-label={dimension === "3D" ? "Show a flat 2D map" : "Show a tilted 3D map"}
        onClick={() => setDimension(dimension === "3D" ? "2D" : "3D")}
        className="flex size-[44px] shrink-0 items-center justify-center rounded-[12px] border border-atlas-beige bg-atlas-paper font-grotesk text-[13px] font-bold leading-[17px] text-atlas-teal"
      >
        {dimension === "3D" ? "2D" : "3D"}
      </button>
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
            <div className="flex w-full items-center gap-[10px] rounded-[14px] border border-atlas-beige bg-atlas-paper p-[4px]">
              <span className="flex size-[44px] shrink-0 items-center justify-center rounded-[12px] bg-atlas-teal">
                <AtlasIcon src="/atlas-ui/icon-home-light-18.svg" size={18} />
              </span>
              <span className="flex h-[44px] min-w-0 flex-1 flex-col items-start justify-center gap-px">
                <h1 className="w-full truncate font-grotesk text-[15px] font-bold leading-[19px] text-atlas-teal">{hotel.name}</h1>
                <span className="w-full truncate font-manrope text-[12px] leading-[16px] text-atlas-slate">
                  {hotel.address ?? "Your hotel and the places it has approved"}
                </span>
              </span>
            </div>
          </div>
          <div className="pointer-events-auto mx-[12px] mt-[6px] wide:mx-0 wide:mt-0">
            <PlanSegment active="explore" />
          </div>
          <div className="pointer-events-auto mt-[8px] wide:mt-0">{chips}</div>
          <div className="pointer-events-auto mr-[12px] mt-[8px] flex flex-col items-start gap-[6px] self-end [@media(max-height:700px)]:flex-row wide:hidden">
            {controls}
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
            aria-controls="live-place-cards"
            onClick={() => setCollapsed(!collapsed)}
            className="absolute left-1/2 top-0 h-[24px] w-[72px] -translate-x-1/2 rounded-b-[12px] wide:hidden"
          >
            <span className="sr-only">{collapsed ? "Show places" : "Hide places to see more of the map"}</span>
          </button>
          <div className="flex min-h-[44px] w-full shrink-0 items-center justify-between pl-[16px] pr-[12px] wide:px-[4px]">
            <h2 className="font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal">
              {visible.length} {visible.length === 1 ? "place" : "places"} for you
            </h2>
          </div>
          <div
            id="live-place-cards"
            hidden={collapsed}
            className="atlas-scroll-fade flex w-full snap-x items-start gap-[10px] overflow-x-auto scroll-px-[16px] px-[16px] pb-[6px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden wide:min-h-0 wide:flex-1 wide:snap-none wide:flex-col wide:overflow-y-auto wide:overflow-x-hidden wide:px-[4px] wide:[mask-image:none] wide:[scrollbar-width:thin]"
          >
            {visible.length === 0 ? (
              <p className="w-full font-manrope text-[14px] leading-[1.45] text-atlas-slate">
                {places.length === 0
                  ? `${hotel.name} hasn't approved any facilities or partners yet. Atlas only shows places your own hotel has signed off.`
                  : "Nothing in this group. Try another filter."}
              </p>
            ) : (
              visible.map((place) => (
                <LivePlaceCard key={place.id} place={place} selected={place.id === selected} onSelect={() => selectPlace(place.id)} />
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
