/*
 * The home map's filter chips. They only narrow the places the server sent (already the guest's catalogue); none adds
 * or substitutes anything.
 *
 *  - "Hotel" and "Partners" narrow businesses; attractions always stay, as the catalogue rule requires (a business
 *    filter never hides attractions).
 *  - "Events" is different in kind: it answers "where is something happening?", so it shows only places with an
 *    upcoming event of the guest's own hotel, attractions included only when they host one.
 */

export const PLACE_FILTERS = ["All", "Hotel", "Partners", "Events"] as const;
export type PlaceFilter = (typeof PLACE_FILTERS)[number];

export type FilterablePlace = {
  source: "facility" | "partner" | "attraction";
  events: readonly unknown[];
};

export function matchesPlaceFilter(filter: PlaceFilter, place: FilterablePlace): boolean {
  if (filter === "Events") return place.events.length > 0;
  if (place.source === "attraction") return true;
  if (filter === "Hotel") return place.source === "facility";
  if (filter === "Partners") return place.source === "partner";
  return true;
}

/** How many places each chip names: the number of its own kind (attractions are not counted under Hotel or Partners). */
export function countPlaceFilters(places: readonly FilterablePlace[]): Record<PlaceFilter, number> {
  return {
    All: places.length,
    Hotel: places.filter((place) => place.source === "facility").length,
    Partners: places.filter((place) => place.source === "partner").length,
    Events: places.filter((place) => place.events.length > 0).length,
  };
}

/** The chips to offer: "Events" only while there is at least one place with an event. */
export function visiblePlaceFilters(counts: Record<PlaceFilter, number>): PlaceFilter[] {
  return PLACE_FILTERS.filter((filter) => filter !== "Events" || counts.Events > 0);
}
