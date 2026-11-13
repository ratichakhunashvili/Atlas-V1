import { FEEDBACK_SEGMENTS, type FeedbackSegment } from "./segments";

/*
 * The admin feedback screen's URL filters. Pure: query-string values are untrusted, so each is checked against what
 * exists (the hotel must be a real hotel id, the segment one of the seven, the page a positive whole number) and
 * anything else is ignored rather than passed to the query.
 */

export const ADMIN_FEEDBACK_PAGE_SIZE = 20;

export type AdminFeedbackParams = { hotel?: string | string[]; note?: string | string[]; page?: string | string[] };
export type AdminFeedbackQuery = { hotelId?: string; noteFor?: FeedbackSegment; page: number };

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export function parseAdminFeedbackParams(params: AdminFeedbackParams, hotelIds: ReadonlySet<string>): AdminFeedbackQuery {
  const hotel = single(params.hotel);
  const note = single(params.note);
  const page = Number(single(params.page));
  return {
    hotelId: hotel && hotelIds.has(hotel) ? hotel : undefined,
    noteFor: note && (FEEDBACK_SEGMENTS as readonly string[]).includes(note) ? (note as FeedbackSegment) : undefined,
    page: Number.isInteger(page) && page >= 1 && page <= 100_000 ? page : 1,
  };
}

/** The URL for another page of the same filter. */
export function adminFeedbackHref(query: AdminFeedbackQuery, page: number): string {
  const search = new URLSearchParams();
  if (query.hotelId) search.set("hotel", query.hotelId);
  if (query.noteFor) search.set("note", query.noteFor);
  if (page > 1) search.set("page", String(page));
  const text = search.toString();
  return text ? `/admin/feedback?${text}` : "/admin/feedback";
}
