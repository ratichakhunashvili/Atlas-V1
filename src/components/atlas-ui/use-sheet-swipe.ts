"use client";

import { useRef, useState, type MouseEvent, type PointerEvent } from "react";

/*
 * Swipe a bottom sheet down to minimise it and up to bring it back. While the finger is down the sheet follows it;
 * on release it settles open or minimised — past a short distance, or a quick flick, it changes state; otherwise it
 * springs back. Vertical only: the sheet uses `touch-action: pan-x`, so side-to-side card scrolling keeps working.
 * Phones only: callers pass `enabled = false` in the wide layout, where the sheet is a side panel.
 */

const SWITCH_DISTANCE = 48;
const FLICK_SPEED = 0.5; // px per ms

export function useSheetSwipe({
  collapsed,
  setCollapsed,
  openHeight,
  collapsedHeight,
  enabled,
}: {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  openHeight: number;
  collapsedHeight: number;
  enabled: boolean;
}) {
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const moved = useRef(false);

  const base = collapsed ? collapsedHeight : openHeight;
  const height = Math.min(openHeight, Math.max(collapsedHeight, base - offset));

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
    if (!collapsed && (dy > SWITCH_DISTANCE || speed > FLICK_SPEED)) setCollapsed(true);
    else if (collapsed && (dy < -SWITCH_DISTANCE || speed < -FLICK_SPEED)) setCollapsed(false);
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
