import { useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_PLAN,
  DEFAULT_PREFERENCES,
  STOPS,
  checkInTime,
  type PlanState,
  type Preferences,
  type StopId,
} from "./plan-model";

/*
 * The prototype's demo state: the guest's choices, today's plan and their check-ins, kept in
 * this browser's localStorage so the walkthrough stays consistent across screens and reloads.
 *
 * Client-only: import it from client components, never from a server page.
 *
 * It is NOT an account. Nothing leaves the browser, other devices never see it, and clearing site
 * data (or "Reset the demo" on /guide) returns everything to the design's starting point. The
 * server render always uses that starting point, so the first paint of every screen is the
 * Figma frame.
 */

export type Flash = { message: string; undo?: PlanState };

export type DemoState = {
  version: 1;
  preferences: Preferences;
  plan: PlanState;
  /** One-off confirmation shown on My plan ("Added the pool to your plan"), with its undo. */
  flash?: Flash;
  /** The stop the guest chose to check in at; the scanner checks in at the next stop otherwise. */
  checkInTarget?: StopId;
  /** The most recent check-in, so the confirmation screens name the right place. */
  lastCheckIn?: StopId;
  /** Which design-review scenario route last seeded the state. */
  seededFrom?: string;
};

const STORAGE_KEY = "atlas-prototype-demo-v1";

export const DEFAULT_DEMO_STATE: DemoState = {
  version: 1,
  preferences: DEFAULT_PREFERENCES,
  plan: DEFAULT_PLAN,
};

let current: DemoState | null = null;
const listeners = new Set<() => void>();

function read(): DemoState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DEMO_STATE;
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    if (parsed.version !== 1 || !parsed.plan || !parsed.preferences) return DEFAULT_DEMO_STATE;
    return parsed as DemoState;
  } catch {
    return DEFAULT_DEMO_STATE;
  }
}

function snapshot(): DemoState {
  if (!current) current = read();
  return current;
}

function serverSnapshot(): DemoState {
  return DEFAULT_DEMO_STATE;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    current = read();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function updateDemo(change: (state: DemoState) => DemoState): void {
  current = change(snapshot());
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Private browsing or storage disabled: the demo still works until the page reloads.
  }
  for (const listener of listeners) listener();
}

export function useDemoState(): DemoState {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/* ------------------------------------------------------------------------------------------ */
/* Actions. Each one keeps completed stops as they are and offers an undo where the design does. */

export function setPreferences(preferences: Preferences): void {
  updateDemo((state) => ({ ...state, preferences }));
}

function changePlan(message: string, change: (plan: PlanState) => PlanState): void {
  updateDemo((state) => ({ ...state, plan: change(state.plan), flash: { message, undo: state.plan } }));
}

/** Saves a proposed plan: completed stops stay, future stops are replaced. */
export function savePlan(stops: StopId[]): void {
  changePlan("Plan saved", (plan) => ({ planned: true, completed: plan.completed, upcoming: stops }));
}

export function addStop(id: StopId, message: string): void {
  changePlan(message, (plan) =>
    plan.upcoming.includes(id) || plan.completed.some((c) => c.id === id)
      ? plan
      : { ...plan, planned: true, upcoming: [...plan.upcoming, id] }
  );
}

export function removeStop(id: StopId, message: string): void {
  changePlan(message, (plan) => ({ ...plan, upcoming: plan.upcoming.filter((u) => u !== id) }));
}

export function replaceStop(from: StopId, to: StopId, message: string): void {
  changePlan(message, (plan) => ({
    ...plan,
    upcoming: plan.upcoming.filter((u) => u !== to).map((u) => (u === from ? to : u)),
  }));
}

/** Makes a place the next stop; the rest keep their order after it. */
export function makeNextStop(id: StopId, message: string): void {
  changePlan(message, (plan) => ({
    ...plan,
    planned: true,
    upcoming: [id, ...plan.upcoming.filter((u) => u !== id)],
  }));
}

/**
 * Puts the stops still to visit in a new order (Reorder stops). Ignored unless `upcoming` holds
 * exactly the same stops, and unavailable stops must keep their place: only the order changes.
 */
export function reorderStops(upcoming: StopId[], message: string): void {
  const plan = snapshot().plan;
  const same = upcoming.length === plan.upcoming.length && plan.upcoming.every((id) => upcoming.includes(id));
  const fixedInPlace = plan.upcoming.every((id, index) => STOPS[id].available || upcoming[index] === id);
  const changed = upcoming.some((id, index) => plan.upcoming[index] !== id);
  if (!same || !fixedInPlace || !changed) return;
  changePlan(message, (current) => ({ ...current, upcoming }));
}

export function undoLastChange(): void {
  updateDemo((state) => (state.flash?.undo ? { ...state, plan: state.flash.undo, flash: undefined } : { ...state, flash: undefined }));
}

export function clearFlash(): void {
  if (!snapshot().flash) return;
  updateDemo((state) => ({ ...state, flash: undefined }));
}

export function chooseCheckIn(id: StopId | undefined): void {
  updateDemo((state) => ({ ...state, checkInTarget: id }));
}

/**
 * Marks a stop as checked in (simulated: nothing was scanned or located). Idempotent: checking in
 * twice changes nothing. Partners can only be checked in from today's plan — the screens gate
 * that — while an attraction found with the camera view may be visited outside the plan, as the
 * design allows; it then joins the plan as a completed stop.
 */
export function checkIn(id: StopId): void {
  updateDemo((state) => {
    const { plan, preferences } = state;
    if (plan.completed.some((c) => c.id === id)) {
      return state.checkInTarget || state.lastCheckIn !== id ? { ...state, checkInTarget: undefined, lastCheckIn: id } : state;
    }
    const timed = plan.upcoming.includes(id) ? plan : { ...plan, upcoming: [id, ...plan.upcoming] };
    const at = checkInTime(timed, preferences.time, id);
    return {
      ...state,
      checkInTarget: undefined,
      lastCheckIn: id,
      flash: undefined,
      plan: { planned: true, completed: [...plan.completed, { id, at }], upcoming: plan.upcoming.filter((u) => u !== id) },
    };
  });
}

export function resetDemo(): void {
  updateDemo(() => DEFAULT_DEMO_STATE);
}

/** Seeds the state for a design-review route, then lets it behave like the live plan. */
export function seedDemo(key: string, state: DemoState): void {
  updateDemo(() => ({ ...state, seededFrom: key }));
}

/** Runs a demo event (a scan, an unlock) once when a screen that represents it opens. */
export function useDemoEvent(apply: () => void, key: string): void {
  useEffect(() => {
    apply();
    // `key` identifies the event; `apply` is recreated on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
