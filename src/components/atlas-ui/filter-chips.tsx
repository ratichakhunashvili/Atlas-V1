"use client";

import { FILTER_PLACES, FILTERS, type MapFilter } from "./fixtures";

/*
 * Filter chips shared by the map sheet (Map layer 1:2926) and the list (List results 1:4283):
 * All, Hotel, Partners, Attractions, To unlock, each with its count. The active chip is Deep Teal.
 */

function FilterShape({ shape, active }: { shape?: "circle" | "square" | "diamond"; active: boolean }) {
  if (!shape) return null;
  const color = active ? "border-atlas-paper" : "border-atlas-teal";
  if (shape === "diamond") {
    return (
      <span aria-hidden className="flex size-[11.314px] shrink-0 items-center justify-center">
        <span className={`size-[8px] -rotate-45 rounded-[2px] border-2 ${color}`} />
      </span>
    );
  }
  return (
    <span aria-hidden className={`size-[10px] shrink-0 border-2 ${color} ${shape === "circle" ? "rounded-[5px]" : "rounded-[2px]"}`} />
  );
}

export function FilterChips({
  filter,
  onChange,
  className = "",
}: {
  filter: MapFilter;
  onChange: (filter: MapFilter) => void;
  className?: string;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Filter places"
      className={`atlas-scroll-fade flex w-full items-start gap-[6px] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden wide:[mask-image:none] wide:flex-wrap ${className}`}
    >
      {FILTERS.map(({ filter: chip, shape }) => {
        const active = chip === filter;
        return (
          <button
            key={chip}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(chip)}
            className={`flex h-[44px] shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[22px] border px-[12px] font-manrope text-[13px] leading-[18px] ${
              active ? "border-atlas-teal bg-atlas-teal" : "border-atlas-beige bg-atlas-paper"
            }`}
          >
            <FilterShape shape={shape} active={active} />
            <span className={`font-semibold ${active ? "text-atlas-paper" : "text-atlas-teal"}`}>{chip}</span>
            <span className={`font-medium ${active ? "text-atlas-paper/75" : "text-atlas-teal/75"}`}>
              {FILTER_PLACES[chip].places.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}
