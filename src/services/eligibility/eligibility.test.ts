import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Hotel, ItineraryDay, ItineraryStop, Place, User } from "@/db/schema";
import { makeTestPlace } from "@/services/advisor/test-utils";
import { generateItineraryForUser, type GenerateItineraryDependencies } from "@/services/advisor/generate-itinerary";
import type { OptimizedRoute } from "@/services/routing";
import {
  MAX_MAP_RADIUS_METERS,
  authorizeGuestHotel,
  clampMapRadius,
  getEligibleExperienceForGuest,
  getEligibleMapPlacesForGuest,
  listEligibleExperiencesForGuest,
  listEligiblePlacesForStay,
  resolveGuestHotelContext,
  type EligibilityDependencies,
  type GuestStay,
} from "./index";
import type { ContractRow, FacilityRow, PartnershipRow } from "./rules";

/**
 * The Atlas catalogue rule (docs/catalogue-model-plan.md §2, tests §9), exercised through the real guest-facing
 * service functions over a small in-memory "database". The pure rule itself is covered in rules.test.ts.
 */

const NOW = new Date("2026-06-15T12:00:00Z");
const CONFIRMED = new Date("2026-01-01T00:00:00Z");

function hotel(id: string, placeId: string): Hotel {
  return { id, placeId, qrToken: `${id}-qr`, createdAt: CONFIRMED, updatedAt: CONFIRMED };
}

const hotelAPlace = makeTestPlace({ id: "hotel-a-place", category: "hotel", latitude: 41.7, longitude: 44.8 });
const hotelBPlace = makeTestPlace({ id: "hotel-b-place", category: "hotel", latitude: 41.705, longitude: 44.8 });
const HOTEL_A = hotel("hotel-a", hotelAPlace.id);
const HOTEL_B = hotel("hotel-b", hotelBPlace.id);

// Everything is within ~150 m of both hotels, so nearness never explains a result.
const near = (id: string, offset: number, extra: Partial<Place> = {}) =>
  makeTestPlace({ id, category: "restaurant", latitude: 41.7 + offset / 10_000, longitude: 44.8, ...extra });

const promotedPartner = near("promoted-partner", 1); // contract + Hotel A partnership
const plainPartner = near("plain-partner", 2); // contract, no partnership
const fortress = near("fortress", 3, { kind: "attraction", category: "landmark" }); // attraction: no contract needed
const partnershipOnly = near("partnership-only", 4); // Hotel A partnership, NO contract
const lapsedPartner = near("lapsed-partner", 5); // contract ended, Hotel A partnership still active
const pendingBiz = near("pending-biz", 6);
const suspendedBiz = near("suspended-biz", 7);
const expiredBiz = near("expired-biz", 8);
const futureBiz = near("future-biz", 9);
const nearbyNoContract = near("nearby-no-contract", 0.5); // closest of all, still nothing
const draftAttraction = near("draft-attraction", 10, { kind: "attraction", category: "landmark", publicationStatus: "draft", publishedAt: null });
const archivedPartner = near("archived-partner", 11, { archivedAt: CONFIRMED, publicationStatus: "draft", publishedAt: null });
const hotelAPool = near("hotel-a-pool", 12, { category: "spa" });
const hotelBGym = near("hotel-b-gym", 13, { category: "spa" });
const ATTRACTION_PLACES = [fortress, draftAttraction];

function contract(place: Place, overrides: Partial<ContractRow> = {}): ContractRow {
  return { id: `contract-${place.id}`, placeId: place.id, status: "active", startsAt: null, endsAt: null, confirmedAt: CONFIRMED, place, ...overrides };
}

function partnership(hotelId: string, place: Place, overrides: Partial<PartnershipRow> = {}): PartnershipRow {
  return {
    id: `pship-${hotelId}-${place.id}`,
    hotelId,
    placeId: place.id,
    status: "active",
    startsAt: null,
    endsAt: null,
    confirmedAt: CONFIRMED,
    priority: 1,
    featured: true,
    offerText: "10% off for our guests",
    place,
    ...overrides,
  };
}

const ALL_CONTRACTS: ContractRow[] = [
  contract(promotedPartner),
  contract(plainPartner),
  contract(lapsedPartner, { status: "ended", endsAt: new Date("2026-06-01T00:00:00Z") }),
  contract(pendingBiz, { status: "pending_review", confirmedAt: null }),
  contract(suspendedBiz, { status: "suspended" }),
  contract(expiredBiz, { endsAt: new Date("2026-06-15T11:59:59Z") }),
  contract(futureBiz, { startsAt: new Date("2026-06-15T12:00:01Z") }),
  contract(archivedPartner),
  // A wrong row: Hotel B's own gym with an Atlas contract. Other hotels' facilities never appear.
  contract(hotelBGym),
];
const ALL_PARTNERSHIPS: PartnershipRow[] = [
  partnership(HOTEL_A.id, promotedPartner),
  partnership(HOTEL_A.id, partnershipOnly),
  partnership(HOTEL_A.id, lapsedPartner),
];
const ALL_FACILITIES: FacilityRow[] = [
  { id: "fac-a-pool", hotelId: HOTEL_A.id, placeId: hotelAPool.id, status: "active", facilityType: "pool", place: hotelAPool },
  { id: "fac-b-gym", hotelId: HOTEL_B.id, placeId: hotelBGym.id, status: "active", facilityType: "gym", place: hotelBGym },
];

type CatalogueData = { contracts: ContractRow[]; partnerships: PartnershipRow[]; facilities: FacilityRow[] };
const ALL_DATA: CatalogueData = { contracts: ALL_CONTRACTS, partnerships: ALL_PARTNERSHIPS, facilities: ALL_FACILITIES };

/** Like the real queries: partnerships and facilities scoped to one hotel, contracts minus other hotels' facilities. */
function makeDeps(stays: Record<string, GuestStay | null>, data: CatalogueData = ALL_DATA): EligibilityDependencies {
  return {
    findActiveStayForUser: async (userId) => stays[userId] ?? null,
    listPartnershipsForHotel: async (hotelId) => data.partnerships.filter((row) => row.hotelId === hotelId),
    listFacilitiesForHotel: async (hotelId) => data.facilities.filter((row) => row.hotelId === hotelId),
    listContractsForCatalogue: async (hotelId) =>
      data.contracts.filter((row) => !data.facilities.some((facility) => facility.placeId === row.placeId && facility.hotelId !== hotelId)),
    // Another hotel's anchor, wrongly marked as an attraction, sneaks in to prove the rule drops it.
    listAttractionsForCatalogue: async () => [...ATTRACTION_PLACES, { ...hotelBPlace, kind: "attraction" as const }],
  };
}

type StayOptions = { checkIn?: Date; checkOut?: Date | null };
function makeStay(h: Hotel, p: Place, options: StayOptions = {}): GuestStay {
  return { id: `stay-${h.id}`, checkIn: options.checkIn ?? new Date("2026-06-15T08:00:00Z"), checkOut: options.checkOut ?? null, hotel: h, place: p };
}

const STAYS: Record<string, GuestStay | null> = {
  "guest-a": makeStay(HOTEL_A, hotelAPlace),
  "guest-b": makeStay(HOTEL_B, hotelBPlace),
  "guest-nostay": null,
  "guest-future": makeStay(HOTEL_A, hotelAPlace, { checkIn: new Date("2026-06-20T00:00:00Z") }),
  "guest-ended": makeStay(HOTEL_A, hotelAPlace, { checkIn: new Date("2026-06-01T00:00:00Z"), checkOut: new Date("2026-06-10T00:00:00Z") }),
};
const DEPS = makeDeps(STAYS);

const ids = (places: Array<{ id: string }>) => places.map((p) => p.id).sort();
const VISIBLE_TO_A = ["fortress", "hotel-a-pool", "plain-partner", "promoted-partner"];
const VISIBLE_TO_B = ["fortress", "hotel-b-gym", "plain-partner", "promoted-partner"];

async function mapIds(userId: string, extra: { center?: { lat: number; lng: number }; radiusMeters?: number } = {}) {
  const result = await getEligibleMapPlacesForGuest({ userId, ...extra }, NOW, DEPS);
  return ids(result.places);
}

describe("the Atlas catalogue, through the guest map", () => {
  test("§9.1 a business with an active, confirmed, in-window contract is visible to guests of any hotel", async () => {
    assert.ok((await mapIds("guest-a")).includes("plain-partner"));
    assert.ok((await mapIds("guest-b")).includes("plain-partner"));
  });

  test("§9.2 no contract, or a pending, suspended, ended, not-yet-started or expired one, keeps a business hidden", async () => {
    for (const userId of ["guest-a", "guest-b"]) {
      const visible = await mapIds(userId);
      for (const hidden of ["partnership-only", "pending-biz", "suspended-biz", "lapsed-partner", "future-biz", "expired-biz", "nearby-no-contract"]) {
        assert.equal(visible.includes(hidden), false, `${hidden} for ${userId}`);
      }
    }
  });

  test("§9.3 a published, verified attraction is visible with no contract and no partnership", async () => {
    assert.ok((await mapIds("guest-a")).includes("fortress"));
    assert.ok((await mapIds("guest-b")).includes("fortress"));
  });

  test("§9.4 unpublished or archived Places of any kind are excluded, even with an active contract", async () => {
    const visible = await mapIds("guest-a");
    assert.equal(visible.includes("draft-attraction"), false);
    assert.equal(visible.includes("archived-partner"), false);
  });

  test("§9.5 a hotel facility is visible only to that hotel's guests", async () => {
    assert.ok((await mapIds("guest-a")).includes("hotel-a-pool"));
    assert.equal((await mapIds("guest-b")).includes("hotel-a-pool"), false);
    // Hotel B's gym is Hotel B's facility: hidden from A even though a contract row wrongly points at it.
    assert.equal((await mapIds("guest-a")).includes("hotel-b-gym"), false);
  });

  test("§9.6 other hotels never appear, and the guest's own hotel is never a destination", async () => {
    assert.deepEqual(await mapIds("guest-a"), VISIBLE_TO_A);
    assert.deepEqual(await mapIds("guest-b"), VISIBLE_TO_B);
  });

  test("§9.10 a Mapbox-only Place, or a nearby database Place with no contract, is never recommended", async () => {
    const visible = await mapIds("guest-a", { radiusMeters: MAX_MAP_RADIUS_METERS });
    assert.equal(visible.includes("mapbox-poi-123"), false);
    assert.equal(visible.includes("nearby-no-contract"), false);
    // The decoy is closer to the hotel than every visible Place: nearness confers nothing.
    assert.ok(nearbyNoContract.latitude < promotedPartner.latitude);
  });

  test("§9.11 manipulated map parameters cannot widen the catalogue: the radius is clamped and the centre only narrows", async () => {
    assert.deepEqual(await mapIds("guest-b", { center: { lat: hotelAPlace.latitude, lng: hotelAPlace.longitude }, radiusMeters: 1e9 }), VISIBLE_TO_B);
    assert.equal(clampMapRadius(1e9), MAX_MAP_RADIUS_METERS);
    assert.ok(clampMapRadius(Number.NaN) > 0);
    const tiny = await mapIds("guest-a", { center: { lat: fortress.latitude, lng: fortress.longitude }, radiusMeters: 1 });
    assert.ok(tiny.every((id) => VISIBLE_TO_A.includes(id)));
  });
});

describe("hotel partnerships promote; they never decide visibility", () => {
  test("§9.7 Hotel A's partnership promotes its Atlas partner for Hotel A's guests only", async () => {
    const a = await listEligibleExperiencesForGuest({ userId: "guest-a" }, NOW, DEPS);
    const b = await listEligibleExperiencesForGuest({ userId: "guest-b" }, NOW, DEPS);
    const forA = a.experiences.find((entry) => entry.place.id === "promoted-partner");
    const forB = b.experiences.find((entry) => entry.place.id === "promoted-partner");
    assert.equal(forA?.source, "partner");
    assert.deepEqual(forA?.promotion, { partnershipId: "pship-hotel-a-promoted-partner", priority: 1, featured: true, offerText: "10% off for our guests" });
    assert.ok(forB, "the same Place is visible to Hotel B's guests");
    assert.equal(forB.promotion, null, "but without Hotel A's promotion");
    assert.ok(a.experiences.filter((entry) => entry.source !== "partner").every((entry) => entry.promotion === null));
  });

  test("§9.8 a partnership with a Place whose contract lapsed makes nothing visible and promotes nothing", async () => {
    const a = await listEligibleExperiencesForGuest({ userId: "guest-a" }, NOW, DEPS);
    assert.equal(a.experiences.some((entry) => entry.place.id === "lapsed-partner"), false);
    assert.equal(a.experiences.some((entry) => entry.place.id === "partnership-only"), false);
  });

  test("§9.13 losing a partnership removes only the promotion; the Place stays available", async () => {
    const deps = makeDeps(STAYS, { ...ALL_DATA, partnerships: [] });
    const entry = await getEligibleExperienceForGuest({ userId: "guest-a", placeId: "promoted-partner" }, NOW, deps);
    assert.equal(entry?.source, "partner");
    assert.equal(entry?.promotion, null);
  });
});

describe("filters only narrow, and never hide attractions", () => {
  test("§9.9 a business-category filter narrows businesses and facilities and keeps attractions visible", async () => {
    const result = await listEligibleExperiencesForGuest({ userId: "guest-a", filter: { categories: ["spa"] } }, NOW, DEPS);
    assert.deepEqual(ids(result.experiences.map((entry) => entry.place)), ["fortress", "hotel-a-pool"]);
  });

  test("§9.11 no filter widens the catalogue", async () => {
    const result = await listEligibleExperiencesForGuest(
      { userId: "guest-a", filter: { categories: ["restaurant", "spa", "landmark", "hotel"], radiusMeters: 1e9 } },
      NOW,
      DEPS
    );
    assert.deepEqual(ids(result.experiences.map((entry) => entry.place)), VISIBLE_TO_A);
  });
});

describe("getEligibleExperienceForGuest (any request carrying a placeId)", () => {
  test("returns a catalogue Place with its source", async () => {
    assert.equal((await getEligibleExperienceForGuest({ userId: "guest-b", placeId: "fortress" }, NOW, DEPS))?.source, "attraction");
    assert.equal((await getEligibleExperienceForGuest({ userId: "guest-b", placeId: "plain-partner" }, NOW, DEPS))?.source, "partner");
    assert.equal((await getEligibleExperienceForGuest({ userId: "guest-a", placeId: "hotel-a-pool" }, NOW, DEPS))?.source, "facility");
  });

  test("§9.11 a placeId outside the catalogue is refused, exactly as if it did not exist", async () => {
    for (const placeId of ["partnership-only", "pending-biz", "lapsed-partner", "nearby-no-contract", "hotel-b-place", "hotel-b-gym", "mapbox-poi-123"]) {
      assert.equal(await getEligibleExperienceForGuest({ userId: "guest-a", placeId }, NOW, DEPS), null, placeId);
    }
    assert.equal(await getEligibleExperienceForGuest({ userId: "guest-b", placeId: "hotel-a-pool" }, NOW, DEPS), null);
  });

  test("no valid stay means no placeId is ever accepted", async () => {
    assert.equal(await getEligibleExperienceForGuest({ userId: "guest-nostay", placeId: "fortress" }, NOW, DEPS), null);
  });
});

describe("hotel resolved only from the authenticated guest's valid active stay", () => {
  test("no stay => nothing (never 'everything nearby')", async () => {
    const result = await getEligibleMapPlacesForGuest({ userId: "guest-nostay" }, NOW, DEPS);
    assert.equal(result.status, "no_active_stay");
    assert.deepEqual(result.places, []);
  });

  test("a stay that has not started, or has already ended, is not a valid stay", async () => {
    assert.deepEqual((await getEligibleMapPlacesForGuest({ userId: "guest-future" }, NOW, DEPS)).places, []);
    assert.deepEqual(await resolveGuestHotelContext("guest-future", NOW, DEPS), { ok: false, reason: "outside_stay_period" });
    assert.deepEqual(await resolveGuestHotelContext("guest-ended", NOW, DEPS), { ok: false, reason: "outside_stay_period" });
  });

  test("§9.11 a forged hotelId is refused and never widens access", async () => {
    assert.deepEqual(await authorizeGuestHotel({ userId: "guest-a", claimedHotelId: HOTEL_A.id }, NOW, DEPS), { ok: true, hotelId: HOTEL_A.id });
    assert.deepEqual(await authorizeGuestHotel({ userId: "guest-a", claimedHotelId: HOTEL_B.id }, NOW, DEPS), { ok: false, reason: "hotel_mismatch" });
    assert.deepEqual(await authorizeGuestHotel({ userId: "guest-nostay", claimedHotelId: HOTEL_A.id }, NOW, DEPS), { ok: false, reason: "no_active_stay" });
  });
});

// ---- Itinerary generation goes through the same boundary ----

function advisorDeps(stay: GuestStay, eligibility: EligibilityDependencies): GenerateItineraryDependencies {
  const user: User = {
    id: "guest",
    email: "guest@example.com",
    name: null,
    passwordHash: "x",
    role: "user",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
  return {
    findUserById: async () => user,
    findActiveStayForUser: async () => stay,
    findPreferencesForUser: async () => ({ userId: "guest", principalId: null, categories: ["restaurant", "spa", "landmark"], budget: null, activityLevel: null, maxDistanceMeters: null, updatedAt: NOW }),
    // The REAL eligibility service, backed by the in-memory rows above, scoped to the stay's hotel.
    listEligiblePlacesForStay: (stay, now) => listEligiblePlacesForStay(stay, now, eligibility),
    findItineraryDay: async () => null,
    findLatestItineraryDayBefore: async () => null,
    listItineraryStops: async () => [],
    getStopUsageHistory: async () => new Map(),
    getWalkingRouteInOrder: async () => ({ ok: true as const, route: { geometry: { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: [] } }, durationSeconds: 600, distanceMeters: 500 } }),
    listUpcomingHotelEvents: async () => [],
    optimizeWalkingRoute: async (input) => ({
      ok: true,
      route: {
        order: input.stops.map((_, i) => i),
        geometry: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
        totalDistanceMeters: 1,
        totalDurationSeconds: 1,
        legs: [],
      } satisfies OptimizedRoute,
    }),
    persistItinerary: async (input) => {
      const day: ItineraryDay = {
        id: "day-1",
        userId: input.userId,
        principalId: null,
        hotelId: input.hotelId,
        hotelStayId: input.hotelStayId,
        dayNumber: input.dayNumber,
        stopCount: input.stops.length,
        routeGeoJson: input.routeGeoJson as ItineraryDay["routeGeoJson"],
        totalDurationSeconds: input.totalDurationSeconds,
        originalDurationSeconds: input.totalDurationSeconds,
        availableMinutes: null,
        generatedAt: input.generatedAt,
        completedAt: input.completedAt,
      };
      const stops: ItineraryStop[] = input.stops.map((stop, i) => ({ id: `stop-${i}`, dayId: "day-1", position: i, supersededAt: null, supersededReason: null, ...stop }));
      return { status: "created", day, stops };
    },
  };
}

describe("Advisor itinerary generation uses only the catalogue", () => {
  test("§9.10 stops come only from the catalogue: no uncontracted, pending or lapsed business, no other hotel", async () => {
    const result = await generateItineraryForUser("guest", NOW, advisorDeps(makeStay(HOTEL_A, hotelAPlace), DEPS), { availableMinutes: 480 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.itinerary.stops.length > 0);
    for (const stop of result.itinerary.stops) {
      assert.ok(VISIBLE_TO_A.includes(stop.placeId ?? ""), `unexpected stop ${stop.placeId}`);
      assert.equal(stop.isHotelStop, false);
    }
  });

  test("an Atlas partner or attraction is planned as an outside stop, not as a hotel facility, promoted or not", async () => {
    // Only the pool is a facility; the rest must be QR (partners) or ordinary stops, never pinned like the hotel's spa.
    const noPartnerships = makeDeps(STAYS, { ...ALL_DATA, partnerships: [] });
    const result = await generateItineraryForUser("guest", NOW, advisorDeps(makeStay(HOTEL_A, hotelAPlace), noPartnerships), { availableMinutes: 480 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const partnerStops = result.itinerary.stops.filter((s) => s.placeId === "plain-partner" || s.placeId === "promoted-partner");
    assert.ok(partnerStops.length > 0, "an unpromoted Atlas partner is still planned");
    for (const stop of partnerStops) assert.equal(stop.checkInMethod, "qr", `${stop.placeId} checks in like a partner`);
  });

  test("§9.12 with nothing eligible the Advisor returns no_eligible_experiences: no substitutes, no hotel stop", async () => {
    const bare: EligibilityDependencies = {
      ...DEPS,
      listContractsForCatalogue: async () => [],
      listAttractionsForCatalogue: async () => [],
      listFacilitiesForHotel: async () => [],
    };
    const result = await generateItineraryForUser("guest", NOW, advisorDeps(makeStay(HOTEL_A, hotelAPlace), bare), { availableMinutes: 240 });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_eligible_experiences");
  });

  test("§9.13 losing the Atlas contract makes a planned Place unavailable, and the earlier stop stays readable", async () => {
    const before = await generateItineraryForUser("guest", NOW, advisorDeps(makeStay(HOTEL_A, hotelAPlace), DEPS), { availableMinutes: 480 });
    assert.equal(before.ok, true);
    if (!before.ok) return;
    const stop = before.itinerary.stops.find((s) => s.placeId === "plain-partner" || s.placeId === "promoted-partner");
    assert.ok(stop, "an Atlas partner was planned while its contract was active");
    // Stops are self-contained snapshots, so history stays readable after the contract ends.
    assert.ok(stop.name.length > 0);
    assert.equal("status" in stop, false);

    const ended = makeDeps(STAYS, {
      ...ALL_DATA,
      contracts: ALL_CONTRACTS.map((row) => (row.placeId === stop.placeId ? { ...row, status: "ended" as const, endsAt: CONFIRMED } : row)),
    });
    assert.equal(await getEligibleExperienceForGuest({ userId: "guest-a", placeId: stop.placeId ?? "" }, NOW, ended), null);
  });
});
