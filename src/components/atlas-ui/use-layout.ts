import { useSyncExternalStore } from "react";

/*
 * The `wide` layout (globals.css) as seen from JavaScript, for the few things CSS cannot do:
 * Mapbox camera padding beside a side panel, and attribution placement. Keep the query identical
 * to the CSS variant. The server render assumes the phone layout.
 */
export const WIDE_QUERY = "(min-width: 768px), (orientation: landscape) and (max-height: 500px)";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeTo(query: string) {
  return (listener: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener("change", listener);
    return () => list.removeEventListener("change", listener);
  };
}

const subscribeWide = subscribeTo(WIDE_QUERY);
const subscribeMotion = subscribeTo(REDUCED_MOTION_QUERY);

export function useWideLayout(): boolean {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => false);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, () => window.matchMedia(REDUCED_MOTION_QUERY).matches, () => false);
}

/** The `short` layout (max-height 500px), e.g. a phone at 200% zoom or held in landscape. */
export const SHORT_QUERY = "(max-height: 500px)";
const subscribeShort = subscribeTo(SHORT_QUERY);

export function useShortScreen(): boolean {
  return useSyncExternalStore(subscribeShort, () => window.matchMedia(SHORT_QUERY).matches, () => false);
}

/** Width of the side panel that holds map sheets in the wide layout; matches --atlas-panel-w. */
export function sidePanelWidth(): number {
  const rail = 88;
  return Math.max(260, Math.min(400, window.innerWidth - rail - 200));
}
