import { z } from "zod";
import {
  FEEDBACK_SEGMENTS,
  NOTE_MAX_LENGTH,
  NOT_USED_VALUE,
  noteField,
  ratingField,
  type FeedbackAnswers,
  type FeedbackSegment,
  type Rating,
} from "./segments";

/*
 * Server-side validation of the feedback form. Every value from the browser is a claim: ratings must be 1–5 (or
 * "Didn't use it" where allowed), notes at most 1000 characters, and the day id a UUID (the server then checks the
 * day is the guest's own and owed feedback). Pure, so it is tested without a database.
 */

export type FeedbackFieldErrors = Partial<Record<string, string>>;

export type FeedbackParseResult =
  | { ok: true; dayId: string; answers: FeedbackAnswers }
  | { ok: false; reason: "invalid_day" }
  | { ok: false; reason: "invalid"; fieldErrors: FeedbackFieldErrors };

const ratingSchema = z.enum(["1", "2", "3", "4", "5"]);

function readText(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

export const FEEDBACK_ERRORS = {
  overallRequired: "Choose a rating from 1 to 5 for your day overall.",
  ratingInvalid: "Choose a rating from 1 to 5, or \"Didn't use it\".",
  noteTooLong: `Keep this to ${NOTE_MAX_LENGTH} characters or fewer.`,
} as const;

export function parseFeedbackForm(formData: FormData): FeedbackParseResult {
  const dayId = z.string().uuid().safeParse(readText(formData, "dayId"));
  if (!dayId.success) return { ok: false, reason: "invalid_day" };

  const fieldErrors: FeedbackFieldErrors = {};
  const answers = {} as Record<FeedbackSegment, { rating: Rating | null; note: string | null }>;

  for (const segment of FEEDBACK_SEGMENTS) {
    const rawRating = readText(formData, ratingField(segment));
    let rating: Rating | null = null;
    if (segment === "overall") {
      const parsed = ratingSchema.safeParse(rawRating);
      if (parsed.success) rating = Number(parsed.data) as Rating;
      else fieldErrors[ratingField(segment)] = FEEDBACK_ERRORS.overallRequired;
    } else if (rawRating !== null && rawRating !== "" && rawRating !== NOT_USED_VALUE) {
      // Left blank or "Didn't use it": stored as NULL.
      const parsed = ratingSchema.safeParse(rawRating);
      if (parsed.success) rating = Number(parsed.data) as Rating;
      else fieldErrors[ratingField(segment)] = FEEDBACK_ERRORS.ratingInvalid;
    }

    // Line breaks count as one character, as the browser's maxlength counts them.
    const note = (readText(formData, noteField(segment)) ?? "").replace(/\r\n/g, "\n").trim();
    if (note.length > NOTE_MAX_LENGTH) fieldErrors[noteField(segment)] = FEEDBACK_ERRORS.noteTooLong;

    answers[segment] = { rating, note: note === "" ? null : note };
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, reason: "invalid", fieldErrors };
  return { ok: true, dayId: dayId.data, answers: answers as FeedbackAnswers };
}

/** The form field to focus first: fields in the order they appear on screen. */
export function firstInvalidField(fieldErrors: FeedbackFieldErrors): string | null {
  for (const segment of FEEDBACK_SEGMENTS) {
    if (fieldErrors[ratingField(segment)]) return ratingField(segment);
    if (fieldErrors[noteField(segment)]) return noteField(segment);
  }
  return null;
}
