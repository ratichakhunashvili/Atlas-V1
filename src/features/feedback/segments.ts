/*
 * The parts of a plan day a guest rates in their private feedback (Phase 2). Order and labels are the owner's.
 * Pure data, shared by the guest form, its validation, the admin screen and the export. Only Atlas platform admins
 * read the answers; guests never see anyone's feedback.
 */

export const FEEDBACK_SEGMENTS = ["overall", "technical", "map", "places", "checkin", "money", "hotel"] as const;
export type FeedbackSegment = (typeof FEEDBACK_SEGMENTS)[number];

/** Every segment except Overall can be answered "Didn't use it" (stored as NULL). */
export const OPTIONAL_SEGMENTS = FEEDBACK_SEGMENTS.filter((segment) => segment !== "overall");

export const SEGMENT_LABELS: Record<FeedbackSegment, string> = {
  overall: "Overall",
  technical: "The app and technical problems",
  map: "Map and directions",
  places: "Places and recommendations",
  checkin: "Check-in and QR codes",
  money: "Prices and money",
  hotel: "Hotel and staff",
};

/** One short line under each label, so the guest knows what the segment covers. */
export const SEGMENT_HINTS: Record<FeedbackSegment, string> = {
  overall: "How was your day with Atlas?",
  technical: "Did the app load, work and keep up?",
  map: "Was the map clear and the walking route easy to follow?",
  places: "Did the places suit you and your time?",
  checkin: "Did checking in and scanning codes work?",
  money: "Were prices what you expected? Any cost surprises?",
  hotel: "Your hotel and its staff, as part of the day.",
};

export const RATING_VALUES = [1, 2, 3, 4, 5] as const;
export type Rating = (typeof RATING_VALUES)[number];

/** What each number means, for the accessible name of each choice. */
export const RATING_WORDS: Record<Rating, string> = { 1: "Very bad", 2: "Bad", 3: "OK", 4: "Good", 5: "Very good" };

export const NOTE_MAX_LENGTH = 1000;

/** The form value for "Didn't use it". */
export const NOT_USED_VALUE = "none";
export const NOT_USED_LABEL = "Didn't use it";

export const ratingField = (segment: FeedbackSegment) => `${segment}_rating`;
export const noteField = (segment: FeedbackSegment) => `${segment}_note`;

/** One segment's answer: a rating (null = didn't use it; never null for Overall) and an optional note. */
export type SegmentAnswer = { rating: Rating | null; note: string | null };
export type FeedbackAnswers = Record<FeedbackSegment, SegmentAnswer> & { overall: { rating: Rating; note: string | null } };
