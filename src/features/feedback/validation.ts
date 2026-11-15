import { z } from "zod";
import { COMMENT_MAX_LENGTH, isFeedbackTopic, type FeedbackSubmission } from "./segments";

/*
 * Server-side validation of the feedback form: one topic from the dropdown and a comment (owner decision, 2026-11-15).
 * Every value from the browser is a claim: the topic must be one of the list, the comment 1–1000 characters after
 * trimming, and the day id a UUID (the server then checks the day is the guest's own and owed feedback). Pure, so it is
 * tested without a database.
 */

export type FeedbackField = "topic" | "comment";
export type FeedbackFieldErrors = Partial<Record<FeedbackField, string>>;

export type FeedbackParseResult =
  | { ok: true; dayId: string; submission: FeedbackSubmission }
  | { ok: false; reason: "invalid_day" }
  | { ok: false; reason: "invalid"; fieldErrors: FeedbackFieldErrors };

export const FEEDBACK_ERRORS = {
  topicRequired: "Choose what your feedback is about.",
  commentRequired: "Tell us what happened.",
  commentTooLong: `Keep this to ${COMMENT_MAX_LENGTH} characters or fewer.`,
} as const;

function readText(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

export function parseFeedbackForm(formData: FormData): FeedbackParseResult {
  const dayId = z.string().uuid().safeParse(readText(formData, "dayId"));
  if (!dayId.success) return { ok: false, reason: "invalid_day" };

  const fieldErrors: FeedbackFieldErrors = {};
  const topic = readText(formData, "topic");
  if (!isFeedbackTopic(topic)) fieldErrors.topic = FEEDBACK_ERRORS.topicRequired;

  // Line breaks count as one character, as the browser's maxlength counts them.
  const comment = (readText(formData, "comment") ?? "").replace(/\r\n/g, "\n").trim();
  if (comment === "") fieldErrors.comment = FEEDBACK_ERRORS.commentRequired;
  else if (comment.length > COMMENT_MAX_LENGTH) fieldErrors.comment = FEEDBACK_ERRORS.commentTooLong;

  if (fieldErrors.topic || fieldErrors.comment || !isFeedbackTopic(topic)) return { ok: false, reason: "invalid", fieldErrors };
  return { ok: true, dayId: dayId.data, submission: { topic, comment } };
}

/** The form field to focus first, in screen order. */
export function firstInvalidField(fieldErrors: FeedbackFieldErrors): FeedbackField | null {
  if (fieldErrors.topic) return "topic";
  if (fieldErrors.comment) return "comment";
  return null;
}
