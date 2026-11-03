"use client";

import { useRef, type PointerEvent } from "react";
import { useSceneContext } from "./scene";

/*
 * 2D | 3D map switch: a two-sided pill whose teal thumb slides to the active side.
 * Tap a side, swipe the pill left (2D) or right (3D), or use the arrow keys.
 */

const SWIPE_PX = 16;

export function DimensionSwitch({ className = "" }: { className?: string }) {
  const { dimension, setDimension } = useSceneContext();
  const startX = useRef<number | null>(null);
  const swiped = useRef(false);
  const is3D = dimension === "3D";

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    startX.current = event.clientX;
    swiped.current = false;
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (startX.current === null) return;
    const dx = event.clientX - startX.current;
    if (Math.abs(dx) < SWIPE_PX) return;
    swiped.current = true;
    setDimension(dx > 0 ? "3D" : "2D");
    startX.current = null;
  };
  const onPointerEnd = () => {
    startX.current = null;
  };

  const side = (value: "2D" | "3D") => {
    const active = dimension === value;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        aria-label={value === "2D" ? "Flat 2D map" : "Tilted 3D map"}
        tabIndex={active ? 0 : -1}
        onClick={() => {
          if (!swiped.current) setDimension(value);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setDimension("2D");
          if (event.key === "ArrowRight") setDimension("3D");
        }}
        className={`relative z-10 flex h-full flex-1 items-center justify-center font-grotesk text-[13px] font-bold leading-[17px] motion-safe:transition-colors ${
          active ? "text-atlas-paper" : "text-atlas-teal"
        }`}
      >
        {value}
      </button>
    );
  };

  return (
    <div
      role="radiogroup"
      aria-label="Map view"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      className={`relative isolate flex h-[44px] w-[96px] shrink-0 touch-pan-y select-none items-stretch rounded-[22px] border border-atlas-beige bg-atlas-paper p-[3px] ${className}`}
    >
      <span
        aria-hidden
        className={`absolute bottom-[3px] left-[3px] top-[3px] w-[calc(50%-3px)] rounded-[19px] bg-atlas-teal motion-safe:transition-transform motion-safe:duration-200 ${
          is3D ? "translate-x-full" : "translate-x-0"
        }`}
      />
      {side("2D")}
      {side("3D")}
    </div>
  );
}
