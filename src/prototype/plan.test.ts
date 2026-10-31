import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { CABLE_CAR, DEMO_HOTEL_A, DEMO_HOTEL_B, ROOFTOP_SPA, WINE_CELLAR } from "./fixtures";
import { getEligibleExperiencesForDemoHotel } from "./eligibility";
import {
  PLACEHOLDER_TRAVEL_MINUTES,
  buildItineraryPreview,
  buildPlanQuery,
  parseFreeTime,
  parseInterests,
  selectExperiences,
  toExperienceView,
  type ExperienceView,
} from "./plan";

const NOW = new Date("2026-06-15T12:00:00Z");
const eligibleFor = (hotelId: string) => getEligibleExperiencesForDemoHotel(hotelId, NOW);

describe("URL parsing never trusts the client", () => {
  test("parseInterests keeps only known interests, de-duplicated", () => {
    assert.deepEqual(parseInterests(["food", "food", "bogus", "wellness"]), ["food", "wellness"]);
    assert.deepEqual(parseInterests("sights"), ["sights"]);
    assert.deepEqual(parseInterests(undefined), []);
    assert.deepEqual(parseInterests(["hotelId=demo-hotel-a", "<script>"]), []);
  });

  test("parseFreeTime accepts only the offered durations", () => {
    assert.equal(parseFreeTime("120"), 120);
    assert.equal(parseFreeTime(["60", "240"]), 60);
    for (const bad of ["0", "-5", "999", "abc", "", "1e3", undefined]) assert.equal(parseFreeTime(bad), null, String(bad));
  });

  test("buildPlanQuery round-trips through the parsers", () => {
    const query = new URLSearchParams(buildPlanQuery({ interests: ["food", "sights"], freeTimeMinutes: 180 }));
    assert.deepEqual(parseInterests(query.getAll("interests")), ["food", "sights"]);
    assert.equal(parseFreeTime(query.get("minutes") ?? undefined), 180);
  });
});

describe("selectExperiences only narrows the eligible set", () => {
  test("interests filter by category", () => {
    const names = selectExperiences(eligibleFor(DEMO_HOTEL_A.id), ["wellness"]).map((e) => e.place.id);
    assert.deepEqual(names, [ROOFTOP_SPA.id]);
    assert.deepEqual(selectExperiences(eligibleFor(DEMO_HOTEL_A.id), ["food"]).map((e) => e.place.id), [WINE_CELLAR.id]);
  });

  test("no interests selected means nothing is shown", () => {
    assert.deepEqual(selectExperiences(eligibleFor(DEMO_HOTEL_A.id), []), []);
  });

  test("Hotel B with wellness or food interests gets an empty list — no substitution from other hotels or non-partners", () => {
    assert.deepEqual(selectExperiences(eligibleFor(DEMO_HOTEL_B.id), ["wellness", "food"]), []);
    assert.deepEqual(selectExperiences(eligibleFor(DEMO_HOTEL_B.id), ["sights"]).map((e) => e.place.id), [CABLE_CAR.id]);
  });

  test("selecting every interest still never surfaces the non-partner café", () => {
    const all = selectExperiences(eligibleFor(DEMO_HOTEL_A.id), ["food", "wellness", "sights", "outdoors"]);
    assert.equal(all.some((e) => e.place.name.includes("Corner Café")), false);
    assert.equal(all.length, 3);
  });
});

describe("toExperienceView", () => {
  test("labels facilities and partners differently", () => {
    const views = eligibleFor(DEMO_HOTEL_A.id).map(toExperienceView);
    assert.equal(views.find((v) => v.id === ROOFTOP_SPA.id)?.kind, "Hotel facility");
    assert.equal(views.find((v) => v.id === WINE_CELLAR.id)?.kind, "Hotel partner");
  });
});

describe("buildItineraryPreview (prototype)", () => {
  const view = (id: string, visitMinutes: number): ExperienceView => ({ id, name: id, description: null, address: null, kind: "Hotel partner", visitMinutes });

  test("fits stops in order within the free time, with a fixed placeholder gap between them", () => {
    const preview = buildItineraryPreview([view("a", 60), view("b", 60)], 240);
    assert.deepEqual(preview.stops.map((s) => [s.experience.id, s.startMinute, s.endMinute]), [
      ["a", 0, 60],
      ["b", 60 + PLACEHOLDER_TRAVEL_MINUTES, 120 + PLACEHOLDER_TRAVEL_MINUTES],
    ]);
    assert.equal(preview.totalMinutes, 135);
    assert.deepEqual(preview.leftOut, []);
  });

  test("an experience that does not fit is reported as left out, never dropped silently or replaced", () => {
    const preview = buildItineraryPreview([view("long", 120), view("short", 30)], 60);
    assert.deepEqual(preview.stops.map((s) => s.experience.id), ["short"]);
    assert.deepEqual(preview.leftOut.map((e) => e.id), ["long"]);
  });

  test("no experiences, or too little time, yields an empty preview — fewer stops, never invented ones", () => {
    assert.deepEqual(buildItineraryPreview([], 240), { stops: [], leftOut: [], totalMinutes: 0 });
    assert.equal(buildItineraryPreview([view("long", 120)], 60).stops.length, 0);
  });

  test("end to end for Hotel A: 3 hours of wine + sights + wellness never contains a non-eligible place", () => {
    const experiences = selectExperiences(eligibleFor(DEMO_HOTEL_A.id), ["food", "wellness", "sights"]).map(toExperienceView);
    const preview = buildItineraryPreview(experiences, 240);
    const allowed = new Set([WINE_CELLAR.id, CABLE_CAR.id, ROOFTOP_SPA.id]);
    for (const stop of preview.stops) assert.ok(allowed.has(stop.experience.id));
    for (const left of preview.leftOut) assert.ok(allowed.has(left.id));
    assert.ok(preview.totalMinutes <= 240);
  });
});
