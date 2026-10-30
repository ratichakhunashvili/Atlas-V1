import { useMemo } from "react";
import type { ScreenKey } from "../screen-hrefs";
import { useDemoState, type DemoState } from "./demo-store";
import { STOPS, timePlan, unlockedAchievements, type AchievementId, type PlanTiming, type Preferences, type StopId } from "./plan-model";

/*
 * What the screens show, derived from the demo state: plan labels, achievement status, where a
 * stop's buttons lead. Client-only (it reads the demo store).
 */

export type LivePlan = { state: DemoState; timing: PlanTiming; unlocked: AchievementId[] };

export function useLivePlan(): LivePlan {
  const state = useDemoState();
  return useMemo(
    () => ({ state, timing: timePlan(state.plan, state.preferences.time), unlocked: unlockedAchievements(state.plan) }),
    [state]
  );
}

/** Places with their own detail screen. Partner Place 3 has none: it is no longer offered. */
export const DETAIL_SCREEN: Partial<Record<StopId, ScreenKey>> = {
  "partner-2": "Detail",
  "partner-1": "DetailP1",
  "partner-4": "DetailP4",
  pool: "FacilityPool",
  spa: "FacilityDetail",
  "attraction-1": "AttractionDetail",
};

/** Walking routes kept as fixtures. Hotel facilities are inside Hotel A, so they have none. */
export const ROUTE_SCREEN: Partial<Record<StopId, ScreenKey>> = {
  "partner-2": "Route",
  "partner-1": "RouteP1",
  "partner-4": "RouteP4",
  "attraction-1": "RouteA1",
};

export const ACHIEVEMENT_TITLES: Record<AchievementId, string> = {
  "achievement-1": "[Achievement 1]",
  "achievement-2": "[Achievement 2]",
  "achievement-3": "[Achievement 3]",
  "achievement-4": "[Achievement 4]",
  "achievement-5": "[Achievement 5]",
};

export const ACHIEVEMENT_SCREEN: Partial<Record<AchievementId, ScreenKey>> = {
  "achievement-1": "AchievementDetailP1",
  "achievement-2": "AchievementDetail",
  "achievement-3": "AchievementDetailP2",
  "achievement-4": "AchievementDetailA1",
  "achievement-5": "AchievementDetailP4",
};

/** Where checking in at this stop happens: a code at partners, the camera view at attractions. */
export function checkInScreen(id: StopId): ScreenKey {
  const kind = STOPS[id].kind;
  if (kind === "attraction") return "ARUnlock";
  if (kind === "facility") return "CheckedIn";
  return "Scan";
}

export function checkInLabel(id: StopId): string {
  return STOPS[id].kind === "attraction" ? "Unlock" : "Check in";
}

export type PlaceStatus = "done" | "next" | "planned" | "not-planned";

export function placeStatus(live: LivePlan, id: StopId): PlaceStatus {
  const stop = live.timing.stops.find((s) => s.id === id);
  if (!stop) return "not-planned";
  if (stop.status === "done") return "done";
  if (stop.status === "next") return "next";
  return "planned";
}

/** "Stop 2 today" for a stop still to visit. */
export function planLabel(live: LivePlan, id: StopId): string | undefined {
  const stop = live.timing.stops.find((s) => s.id === id);
  return stop && (stop.status === "next" || stop.status === "later") ? `Stop ${stop.position} today` : undefined;
}

export type AchievementLabel = { unlocked: boolean; label: string };

export function achievementLabel(live: LivePlan, id: StopId): AchievementLabel | undefined {
  const achievement = STOPS[id].achievement;
  if (!achievement) return undefined;
  if (live.unlocked.includes(achievement)) {
    const today = live.state.plan.completed.some((c) => c.id === id);
    return { unlocked: true, label: today ? "Unlocked today" : "Unlocked yesterday" };
  }
  return { unlocked: false, label: STOPS[id].kind === "attraction" ? "Unlock with camera" : "To unlock" };
}

/** Context header subtitle: "2 h free · Food, Culture · Moderate". */
export function preferencesSummary(preferences: Preferences): string {
  const interests = preferences.interests.length > 0 ? preferences.interests.join(", ") : "Any interest";
  const price = preferences.price === "Any" ? "Any price" : preferences.price;
  return `${preferences.time} free · ${interests} · ${price}`;
}
