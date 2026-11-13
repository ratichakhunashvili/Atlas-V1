import "server-only";
import { db } from "@/db";
import {
  listDaysNeedingFeedback as listOwedOperation,
  listFeedbackCandidates as listCandidatesOperation,
  listFeedbackForAdmin as listAdminOperation,
  submitPlanDayFeedback as submitOperation,
  type AdminFeedbackFilter,
} from "@/db/operations/plan-day-feedback";
import type { FeedbackAnswers } from "@/features/feedback/segments";
import type { TodayPlanDay } from "@/services/feedback/needs-feedback";

/** Thin bindings of the production handle; the SQL lives in db/operations/plan-day-feedback.ts. */

export async function listFeedbackCandidates(userId: string) {
  return listCandidatesOperation(db, userId);
}

export async function listDaysNeedingFeedback(userId: string, today: TodayPlanDay) {
  return listOwedOperation(db, userId, today);
}

export async function submitPlanDayFeedback(input: { userId: string; dayId: string; today: TodayPlanDay; answers: FeedbackAnswers; now: Date }) {
  return submitOperation(db, input);
}

export async function listFeedbackForAdmin(input: AdminFeedbackFilter & { page: number; pageSize: number }) {
  return listAdminOperation(db, input);
}
