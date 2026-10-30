import { DEFAULT_PLAN, DEFAULT_PREFERENCES, type PlanState, type StopId } from "./plan-model";

/*
 * Design-review scenarios: the My plan states the Figma file draws (frames 1:2180 – 1:2741).
 * Each route under /plan seeds the demo state with one of these, so /guide can open every state
 * the design shows, and from there the plan behaves like the live one (undo, check in, return to
 * My plan) instead of snapping back. Pure data: safe to import from server pages.
 */

export type PlanScenario = "base" | "empty" | "replaced" | "removed" | "addedSpa" | "addedPool" | "addedA1" | "addedP4";

const withUpcoming = (upcoming: StopId[]): PlanState => ({ ...DEFAULT_PLAN, upcoming });

export const PLAN_SCENARIOS: Record<PlanScenario, { plan: PlanState; message?: string }> = {
  base: { plan: DEFAULT_PLAN },
  empty: { plan: { planned: false, completed: [], upcoming: [] } },
  replaced: { plan: withUpcoming(["partner-2", "partner-4"]), message: "Stop 3 replaced with Partner Place 4" },
  removed: { plan: withUpcoming(["partner-2"]), message: "Stop 3 removed from your plan" },
  addedSpa: { plan: withUpcoming(["partner-2", "partner-3", "spa"]), message: "Added the spa to your plan" },
  addedPool: { plan: withUpcoming(["partner-2", "partner-3", "pool"]), message: "Added the pool to your plan" },
  addedA1: { plan: withUpcoming(["partner-2", "partner-3", "attraction-1"]), message: "Added Attraction 1 to your plan" },
  addedP4: { plan: withUpcoming(["partner-2", "partner-3", "partner-4"]), message: "Added Partner Place 4 to your plan" },
};

/** The demo state a scenario route starts from. */
export function scenarioState(scenario: PlanScenario) {
  const { plan, message } = PLAN_SCENARIOS[scenario];
  return {
    version: 1 as const,
    preferences: DEFAULT_PREFERENCES,
    plan,
    flash: message ? { message, undo: DEFAULT_PLAN } : undefined,
  };
}
