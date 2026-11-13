/*
 * Which of a guest's plan days are owed private feedback (Phase 2). Pure, so the rule is tested on its own; the
 * database operation (db/operations/plan-day-feedback.ts) only gathers the facts and applies this.
 *
 * A day needs feedback when it has none yet AND either
 *   (a) it is today's day of the guest's current stay and today's plan is finished, or
 *   (b) it is any earlier day (an earlier day of this stay, or a day of an earlier stay) on which at least one stop
 *       was visited.
 * Today's unfinished day never needs it yet. Days set aside by the test-only "Start today again" (day_number <= 0)
 * never need it. Days from before feedback shipped never need it either; the candidate query leaves them out
 * (itinerary_days.feedback_requested, migration 0036).
 */

export type FeedbackCandidate = {
  dayId: string;
  dayNumber: number;
  hasFeedback: boolean;
  visitedStops: number;
};

/** Today's day of the current stay, as the daily plan sees it. dayId null: no active stay, or today not started. */
export type TodayPlanDay = { dayId: string | null; finished: boolean };

export const NO_TODAY: TodayPlanDay = { dayId: null, finished: false };

export function dayNeedsFeedback(day: FeedbackCandidate, today: TodayPlanDay): boolean {
  if (day.dayNumber <= 0 || day.hasFeedback) return false;
  if (today.dayId !== null && day.dayId === today.dayId) return today.finished;
  return day.visitedStops > 0;
}

/** The daily plan's state reduced to what the rule needs. */
export function todayFromPlanState(state: { status: string; dayId?: string }): TodayPlanDay {
  if (state.status === "no_stay" || state.status === "not_started" || !state.dayId) return NO_TODAY;
  return { dayId: state.dayId, finished: state.status === "finished" };
}
