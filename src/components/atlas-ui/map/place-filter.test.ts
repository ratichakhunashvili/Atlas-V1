import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { countPlaceFilters, matchesPlaceFilter, visiblePlaceFilters, type FilterablePlace } from "./place-filter";

const EVENT = [{ id: "e1" }];
const places: (FilterablePlace & { name: string })[] = [
  { name: "Spa", source: "facility", events: EVENT },
  { name: "Pool", source: "facility", events: [] },
  { name: "Cafe", source: "partner", events: EVENT },
  { name: "Bistro", source: "partner", events: [] },
  { name: "Fortress", source: "attraction", events: EVENT },
  { name: "Viewpoint", source: "attraction", events: [] },
];
const shown = (filter: Parameters<typeof matchesPlaceFilter>[0]) =>
  places.filter((place) => matchesPlaceFilter(filter, place)).map((place) => place.name);

describe("the home map's filter chips", () => {
  it("All shows everything", () => {
    assert.deepEqual(shown("All"), ["Spa", "Pool", "Cafe", "Bistro", "Fortress", "Viewpoint"]);
  });

  it("Hotel and Partners narrow businesses but never hide attractions", () => {
    assert.deepEqual(shown("Hotel"), ["Spa", "Pool", "Fortress", "Viewpoint"]);
    assert.deepEqual(shown("Partners"), ["Cafe", "Bistro", "Fortress", "Viewpoint"]);
  });

  it("Events shows only places with an upcoming event, attractions included only when they host one", () => {
    assert.deepEqual(shown("Events"), ["Spa", "Cafe", "Fortress"]);
  });

  it("counts each chip, and offers Events only while there is an event", () => {
    const counts = countPlaceFilters(places);
    assert.deepEqual(counts, { All: 6, Hotel: 2, Partners: 2, Events: 3 });
    assert.deepEqual(visiblePlaceFilters(counts), ["All", "Hotel", "Partners", "Events"]);
    assert.deepEqual(visiblePlaceFilters(countPlaceFilters(places.map((place) => ({ ...place, events: [] })))), ["All", "Hotel", "Partners"]);
  });
});

describe("hotel events on the guest map: wiring", () => {
  const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

  it("the home page gets events only from the eligibility service, for the guest's own stay", () => {
    const page = read("src/app/(guest)/(map)/page.tsx");
    assert.match(page, /listUpcomingHotelEventsForGuest\(\{ userId: user\.id \}/);
    assert.doesNotMatch(page, /@\/db\/queries\/hotel-events/);
    assert.match(page, /eventsByVenue\(events, map\.places\.map/);
  });

  it("the badge is a native symbol layer on the places source, added with the other layers, and its image is registered like the markers", () => {
    const engine = read("src/components/atlas-ui/map/engine.ts");
    const load = engine.slice(engine.indexOf('map.once("load"'), engine.indexOf("onReady();"));
    assert.match(load, /if \(!map\.getLayer\(EVENT_BADGE_LAYER\)\)/);
    assert.match(load, /id: EVENT_BADGE_LAYER,\n\s+type: "symbol",\n\s+source: "atlas-places"/);
    assert.match(load, /markerImageId\("event-badge"\)/);
    assert.match(read("src/components/atlas-ui/map/markers.ts"), /"event-badge": \{/);
    assert.doesNotMatch(read("src/components/atlas-ui/map/live-missions-map.tsx"), /new mapboxgl|\.Marker\(/);
  });
});
