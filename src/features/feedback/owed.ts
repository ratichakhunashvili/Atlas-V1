import "server-only";
import { listFeedbackCandidates } from "@/db/queries/plan-day-feedback";
import { selectDaysNeedingFeedback, type DayNeedingFeedback } from "@/db/operations/plan-day-feedback";
import { getDailyPlanForUser, type DailyPlanState } from "@/services/advisor/daily-plan";
import { todayFromPlanState, type TodayPlanDay } from "@/services/feedback/needs-feedback";

/**
 * The signed-in guest's days owed private feedback, today's (when finished) first. Reads the candidates first and only
 * works out today's plan when there is a candidate to judge; a caller that already has today's plan passes it in.
 */
export async function findDaysOwingFeedback(
  userId: string,
  options: { now?: Date; plan?: DailyPlanState } = {}
): Promise<{ owed: DayNeedingFeedback[]; today: TodayPlanDay }> {
  const now = options.now ?? new Date();
  const candidates = await listFeedbackCandidates(userId);
  if (candidates.length === 0) return { owed: [], today: { dayId: null, finished: false } };
  const plan = options.plan ?? (await getDailyPlanForUser(userId, now));
  const today = todayFromPlanState(plan);
  return { owed: selectDaysNeedingFeedback(candidates, today), today };
}
