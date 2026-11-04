"use client";

import { useRef, useState, type MouseEvent, type PointerEvent } from "react";

/*
 * Drag a bottom sheet between its heights (for example minimised, cards and full list). While the finger is down the
 * sheet follows it; on release it settles on the nearest height — and past a short distance, or after a quick flick,
 * it always moves at least one step that way, so a small swipe is never lost. Vertical only: the sheet uses
 * `touch-action: pan-x`, so side-to-side card scrolling keeps working; a list inside it sets its own touch-action so it
 * still scrolls, and hands a pull-down at its top to the sheet.
 * Phones only: callers pass `enabled = false` in the wide layout, where the sheet is a side panel.
 */

const SWITCH_DISTANCE = 48;
const FLICK_SPEED = 0.5; // px per ms

export function useSheetSwipe({
  level,
  setLevel,
  heights,
  enabled,
}: {
  /** Index into `heights`. */
  level: number;
  setLevel: (level: number) => void;
  /** The heights the sheet can rest at, smallest first, in px. */
  heights: readonly number[];
  enabled: boolean;
}) {
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const moved = useRef(false);

  const top = heights.length - 1;
  const base = heights[Math.min(level, top)];
  const height = Math.min(heights[top], Math.max(heights[0], base - offset));

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!enabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    start.current = { x: event.clientX, y: event.clientY, t: event.timeStamp, id: event.pointerId };
    moved.current = false;
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s || s.id !== event.pointerId) return;
    const dy = event.clientY - s.y;
    if (!moved.current && Math.abs(dy) < 6) return;
    if (!moved.current && Math.abs(event.clientX - s.x) > Math.abs(dy)) {
      // Mostly sideways: that's the cards scrolling, not the sheet.
      start.current = null;
      return;
    }
    if (!moved.current) {
      moved.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setOffset(dy);
  };

  const finish = (event: PointerEvent<HTMLElement>) => {
    const s = start.current;
    start.current = null;
    if (!s || !moved.current) return;
    const dy = event.clientY - s.y;
    const speed = dy / Math.max(1, event.timeStamp - s.t);
    const released = base - dy;
    let next = heights.reduce((best, h, i) => (Math.abs(h - released) < Math.abs(heights[best] - released) ? i : best), 0);
    if (next === level) {
      if (dy > SWITCH_DISTANCE || speed > FLICK_SPEED) next = level - 1;
      else if (dy < -SWITCH_DISTANCE || speed < -FLICK_SPEED) next = level + 1;
    }
    setLevel(Math.min(top, Math.max(0, next)));
    setOffset(0);
  };

  /** A drag that just ended must not also count as a tap on whatever was under the finger. */
  const onClickCapture = (event: MouseEvent) => {
    if (moved.current) {
      event.preventDefault();
      event.stopPropagation();
      moved.current = false;
    }
  };

  return {
    height,
    dragging: offset !== 0,
    handlers: enabled
      ? { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish, onClickCapture }
      : {},
  };
}
