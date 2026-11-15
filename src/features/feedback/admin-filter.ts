import { isFeedbackTopic, type FeedbackTopic } from "./segments";

/*
 * The admin feedback screen's URL filters. Pure: query-string values are untrusted, so each is checked against what
 * exists (the hotel must be a real hotel id, the topic one of the list, the page a positive whole number) and
 * anything else is ignored rather than passed to the query.
 */

export const ADMIN_FEEDBACK_PAGE_SIZE = 20;

export type AdminFeedbackParams = { hotel?: string | string[]; topic?: string | string[]; guest?: string | string[]; page?: string | string[] };
export type AdminFeedbackQuery = { hotelId?: string; topic?: FeedbackTopic; guestId?: string; page: number };

/** A guest is chosen by account id (from a link on an entry), never by email, so no email ends up in a URL or a log. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export function parseAdminFeedbackParams(params: AdminFeedbackParams, hotelIds: ReadonlySet<string>): AdminFeedbackQuery {
  const hotel = single(params.hotel);
  const topic = single(params.topic);
  const guest = single(params.guest);
  const page = Number(single(params.page));
  return {
    hotelId: hotel && hotelIds.has(hotel) ? hotel : undefined,
    topic: isFeedbackTopic(topic) ? topic : undefined,
    guestId: guest && UUID.test(guest) ? guest.toLowerCase() : undefined,
    page: Number.isInteger(page) && page >= 1 && page <= 100_000 ? page : 1,
  };
}

/** The URL for another page of the same filter. */
export function adminFeedbackHref(query: AdminFeedbackQuery, page: number): string {
  const search = new URLSearchParams();
  if (query.hotelId) search.set("hotel", query.hotelId);
  if (query.topic) search.set("topic", query.topic);
  if (query.guestId) search.set("guest", query.guestId);
  if (page > 1) search.set("page", String(page));
  const text = search.toString();
  return text ? `/admin/feedback?${text}` : "/admin/feedback";
}
