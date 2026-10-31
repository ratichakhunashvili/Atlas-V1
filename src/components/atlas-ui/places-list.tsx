"use client";

import { useState } from "react";
import { AtlasIcon } from "./asset";
import { AtlasBottomBar } from "./bottom-bar";
import { achievementLabel, useLivePlan } from "./demo/live";
import { FilterChips } from "./filter-chips";
import { FILTER_PLACES, LIST_ORDER, PLACES, type ListSort, type MapFilter, type PlaceId } from "./fixtures";
import { ContextHeader, PlanSegment } from "./missions-chrome";
import { PlaceRow } from "./place-row";
import { AtlasLink } from "./ui";

/*
 * List · Missions › List — Figma frame 1:252, with the List results component set (1:4283):
 * the same places as the map, as rows. Chips filter, Sort switches between "Closest first" and
 * "Shortest visit", search narrows by name or category, rows open the place, and "Map" goes
 * back to the map. Every row is one of Hotel A's own or approved places from the fixtures;
 * search never reaches beyond them.
 */

function matches(id: PlaceId, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const place = PLACES[id];
  return `${place.name} ${place.eyebrow} ${place.meta}`.toLowerCase().includes(q);
}

export function PlacesList() {
  const [filter, setFilter] = useState<MapFilter>("All");
  const [sort, setSort] = useState<ListSort>("Closest first");
  const [query, setQuery] = useState("");
  const live = useLivePlan();

  const allowed = FILTER_PLACES[filter].places;
  const rows = LIST_ORDER[sort].filter((id) => allowed.includes(id) && matches(id, query));
  const count = rows.length;
  const searching = query.trim().length > 0;
  const otherSort: ListSort = sort === "Closest first" ? "Shortest visit" : "Closest first";

  return (
    <main className="relative flex min-h-[100dvh] w-full flex-col bg-atlas-paper">
      <div className="mx-auto flex w-full max-w-[960px] flex-1 flex-col items-start gap-[10px] p-[12px] pt-[calc(12px+env(safe-area-inset-top))] wide:px-[24px] wide:pt-[calc(20px+env(safe-area-inset-top))]">
        <ContextHeader />
        <PlanSegment active="explore" />
        <label className="flex h-[44px] w-full items-center gap-[8px] rounded-[22px] border border-atlas-umber bg-white pl-[12px] pr-[6px] focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-atlas-teal">
          <AtlasIcon src="/atlas-ui/icon-search.svg" size={18} className="shrink-0" />
          <span className="sr-only">Search Hotel A&apos;s places</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search places"
            className="min-w-0 flex-1 bg-transparent font-manrope text-[16px] leading-[22px] text-atlas-ink outline-none placeholder:text-atlas-slate/70 [&::-webkit-search-cancel-button]:hidden"
          />
          {searching ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="flex h-[32px] shrink-0 items-center rounded-[16px] px-[10px] font-manrope text-[13px] font-semibold leading-[18px] text-atlas-teal"
            >
              Clear
            </button>
          ) : null}
        </label>
        <div className="flex w-full flex-col items-start gap-[10px]">
          <FilterChips filter={filter} onChange={setFilter} />
          <div className="flex w-full flex-wrap items-center justify-between gap-x-[8px]">
            <h1 aria-live="polite" className="font-grotesk text-[18px] font-bold leading-[23px] text-atlas-teal">
              {count} {count === 1 ? "place" : "places"}
            </h1>
            <div className="flex items-center gap-[4px]">
              <button
                type="button"
                onClick={() => setSort(otherSort)}
                aria-label={`Sorted by ${sort}. Sort by ${otherSort}`}
                className="flex h-[44px] items-center gap-[6px] px-[4px] font-manrope text-[13px] font-semibold leading-[18px] text-atlas-teal"
              >
                <AtlasIcon src="/atlas-ui/icon-sort.svg" size={15} />
                {sort}
              </button>
              <AtlasLink
                to="Main"
                className="flex h-[44px] items-center gap-[6px] rounded-[22px] border border-atlas-beige px-[12px] font-manrope text-[13px] font-semibold leading-[18px] text-atlas-ink"
              >
                <AtlasIcon src="/atlas-ui/icon-map-teal.svg" size={16} />
                Map
              </AtlasLink>
            </div>
          </div>
          {count === 0 ? (
            <div role="status" className="flex w-full flex-col items-start gap-[10px] rounded-[14px] border border-dashed border-atlas-umber p-[16px]">
              <p className="font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal">
                {searching ? `No places match “${query.trim()}”` : "No places in this filter"}
              </p>
              <p className="font-manrope text-[14px] leading-[1.5] text-atlas-ink">
                Search only covers places Hotel A offers or has approved. Try another word, or show everything.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilter("All");
                }}
                className="flex h-[44px] items-center rounded-[12px] border border-atlas-teal px-[14px] font-manrope text-[14px] font-semibold leading-[19px] text-atlas-teal"
              >
                Clear search and filters
              </button>
            </div>
          ) : (
            <ul className="grid w-full grid-cols-1 gap-[10px] lg:grid-cols-2">
              {rows.map((id) => (
                <li key={id} className="flex">
                  <PlaceRow place={PLACES[id]} photo={PLACES[id].listPhoto} achievement={achievementLabel(live, id)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="sticky bottom-0 z-10">
        <AtlasBottomBar active="missions" />
      </div>
    </main>
  );
}
