/**
 * Small keyboard-focus helpers for guest screens that swap content in place (the map's place sheet, the daily plan,
 * the stay panel). Pure apart from a module-level request slot, so they are tested without a browser.
 *
 * Why they exist (U094): when a control that opened something disappears, the browser drops focus to <body> and a
 * keyboard or screen-reader user loses their place. Screens move focus deliberately instead — to the heading of what
 * just opened, and back to the control that opened it when it closes.
 */

/** The key that dismisses a sheet or panel: a plain Escape, not one pressed mid-composition (an IME) or with modifiers. */
export function isDismissKey(event: {
  key: string;
  isComposing?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}): boolean {
  if (event.key !== "Escape" || event.isComposing) return false;
  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

/**
 * Focus requests that must survive a server round trip: a form posts a server action, the server redirects back to the
 * same screen with new content, and that screen then moves focus where it says. A request names the screen it is for
 * and expires, so a stale one can never move focus on a later, unrelated visit.
 */
const REQUEST_TTL_MS = 15_000;
let pending: { key: string; at: number } | null = null;

export function requestFocusAfterAction(key: string, now: number = Date.now()): void {
  pending = { key, at: now };
}

/** True once, for a live request with this key; the request is then used up. Requests for another key are kept. */
export function consumeFocusRequest(key: string, now: number = Date.now()): boolean {
  if (!pending) return false;
  if (now - pending.at > REQUEST_TTL_MS) {
    pending = null;
    return false;
  }
  if (pending.key !== key) return false;
  pending = null;
  return true;
}

/** Test-only reset of the request slot. */
export function clearFocusRequest(): void {
  pending = null;
}
