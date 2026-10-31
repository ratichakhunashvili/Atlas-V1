import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Hotel, ItineraryDay, ItineraryStop, Place, User } from "@/db/schema";
import { makeTestPlace } from "@/services/advisor/test-utils";
import { generateItineraryForUser, type GenerateItineraryDependencies } from "@/services/advisor/generate-itinerary";
import type { OptimizedRoute } from "@/services/routing";
import {
  MAX_MAP_RADIUS_METERS,
  MIN_MAP_RADIUS_METERS,
  authorizeGuestHotel,
  clampMapRadius,
  getEligibleExperienceForGuest,
  listEligibleExperiencesForGuest,
  getEligibleMapPlacesForGuest,
  listEligiblePlacesForStay,
  resolveGuestHotelContext,
  type EligibilityDependencies,
  type GuestStay,
} from "./index";
import type { FacilityRow, PartnershipRow } from "./rules";

const NOW = new Date("2026-06-15T12:00:00Z");

// ---- A tiny in-memory "database" with two hotels and a catalogue of Places ----

function hotel(id: string, placeId: string): Hotel {
  return { id, placeId, qrToken: `${id}-qr`, createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:00Z") };
}

const hotelAPlace = makeTestPlace({ id: "hotel-a-place", category: "hotel", latitude: 41.7, longitude: 44.8 });
const hotelBPlace = makeTestPlace({ id: "hotel-b-place", category: "hotel", latitude: 41.9, longitude: 44.9 });
const HOTEL_A = hotel("hotel-a", hotelAPlace.id);
const HOTEL_B = hotel("hotel-b", hotelBPlace.id);

// Everything below is within ~1km of Hotel A.
const partnerA = makeTestPlace({ id: "partner-a", category: "restaurant", latitude: 41.701, longitude: 44.8 });
const sharedPartner = makeTestPlace({ id: "shared-partner", category: "restaurant", latitude: 41.702, longitude: 44.8 });
const nearbyNonPartner = makeTestPlace({ id: "nearby-non-partner", category: "restaurant", latitude: 41.7005, longitude: 44.8 });
const popularNonPartner = makeTestPlace({ id: "popular-non-partner", category: "restaurant", latitude: 41.7001, longitude: 44.8 });
const hotelAPool = makeTestPlace({ id: "hotel-a-pool", category: "spa", latitude: 41.7002, longitude: 44.8 });
const pendingPlace = makeTestPlace({ id: "pending-place", category: "restaurant", latitude: 41.7003, longitude: 44.8 });
const revokedPlace = makeTestPlace({ id: "revoked-place", category: "restaurant", latitude: 41.7004, longitude: 44.8 });
// Hotel B's partner is ~25km from Hotel A.
const partnerB = makeTestPlace({ id: "partner-b", category: "restaurant", latitude: 41.92, longitude: 44.9 });

const CONFIRMED = new Date("2026-01-01T00:00:00Z");

function partnership(hotelId: string, place: Place, overrides: Partial<PartnershipRow> = {}): PartnershipRow {
  return {
    id: `pship-${hotelId}-${place.id}`,
    hotelId,
    placeId: place.id,
    status: "active",
    startsAt: null,
    endsAt: null,
    confirmedAt: CONFIRMED,
    priority: null,
    featured: false,
    offerText: null,
    place,
    ...overrides,
  };
}

const ALL_PARTNERSHIPS: PartnershipRow[] = [
  partnership(HOTEL_A.id, partnerA),
  partnership(HOTEL_A.id, sharedPartner),
  partnership(HOTEL_B.id, sharedPartner),
  partnership(HOTEL_B.id, partnerB),
  partnership(HOTEL_A.id, pendingPlace, { status: "pending_review", confirmedAt: null }),
  partnership(HOTEL_A.id, revokedPlace, { status: "revoked" }),
];
const ALL_FACILITIES: FacilityRow[] = [
  { id: "fac-a-pool", hotelId: HOTEL_A.id, placeId: hotelAPool.id, status: "active", facilityType: "pool", place: hotelAPool },
];

type StayOptions = { checkIn?: Date; checkOut?: Date | null };

function makeStay(h: Hotel, p: Place, options: StayOptions = {}): GuestStay {
  return { id: `stay-${h.id}`, checkIn: options.checkIn ?? new Date("2026-06-15T08:00:00Z"), checkOut: options.checkOut ?? null, hotel: h, place: p };
}

/** Like the real queries: strictly scoped to the hotelId asked for. */
function makeDeps(stays: Record<string, GuestStay | null>): EligibilityDependencies {
  return {
    findActiveStayForUser: async (userId) => stays[userId] ?? null,
    listPartnershipsForHotel: async (hotelId) => ALL_PARTNERSHIPS.filter((row) => row.hotelId === hotelId),
    listFacilitiesForHotel: async (hotelId) => ALL_FACILITIES.filter((row) => row.hotelId === hotelId),
  };
}

const DEPS = makeDeps({
  "guest-a": makeStay(HOTEL_A, hotelAPlace),
  "guest-b": makeStay(HOTEL_B, hotelBPlace),
  "guest-nostay": null,
  "guest-future": makeStay(HOTEL_A, hotelAPlace, { checkIn: new Date("2026-06-20T00:00:00Z") }),
  "guest-ended": makeStay(HOTEL_A, hotelAPlace, { checkIn: new Date("2026-06-01T00:00:00Z"), checkOut: new Date("2026-06-10T00:00:00Z") }),
});

const ids = (places: Array<{ id: string }>) => places.map((p) => p.id).sort();

// ---- The 8 required tests (+ lifecycle), exercised through the real guest-facing service functions ----

describe("guest map discovery (getEligibleMapPlacesForGuest)", () => {
  test("1. Hotel A's guest receives Partner A and the hotel-owned facility", async () => {
    const result = await getEligibleMapPlacesForGuest({ userId: "guest-a" }, NOW, DEPS);
    assert.equal(result.status, "ok");
    assert.ok(ids(result.places).includes("partner-a"));
    assert.ok(ids(result.places).includes("hotel-a-pool"));
  });

  test("2. Hotel B's guest does not receive Partner A without its own relationship", async () => {
    const result = await getEligibleMapPlacesForGuest({ userId: "guest-b" }, NOW, DEPS);
    assert.equal(ids(result.places).includes("partner-a"), false);
    assert.deepEqual(ids(result.places), ["partner-b", "shared-partner"]);
  });

  test("3. a nearby non-partner (and a 'popular' one) in the database is excluded from discovery, even with a huge radius", async () => {
    const result = await getEligibleMapPlacesForGuest(
      { userId: "guest-a", center: { lat: 41.7005, lng: 44.8 }, radiusMeters: 10_000_000 },
      NOW,
      DEPS
    );
    assert.equal(ids(result.places).includes("nearby-non-partner"), false);
    assert.equal(ids(result.places).includes("popular-non-partner"), false);
    // The decoys really are closer to the hotel than the partner that IS returned — nearness confers nothing.
    const gap = (place: Place) => Math.abs(place.latitude - hotelAPlace.latitude);
    assert.ok(gap(nearbyNonPartner) < gap(partnerA));
    assert.ok(gap(popularNonPartner) < gap(partnerA));
    assert.ok(ids(result.places).includes("partner-a"));
  });

  test("4. a Mapbox-only Place is never recommended: the only inputs are Atlas's own hotel relationships", async () => {
    // Mapbox POIs have no row in Atlas's database, hence no relationship; there is no code path that feeds them in.
    const result = await getEligibleMapPlacesForGuest({ userId: "guest-a" }, NOW, DEPS);
    const mapboxOnly = "mapbox-poi-123";
    assert.equal(ids(result.places).includes(mapboxOnly), false);
    assert.deepEqual(ids(result.places), ["hotel-a-pool", "partner-a", "shared-partner"]);
  });

  test("5. a hotel-owned facility is eligible without an external partnership", async () => {
    const result = await getEligibleMapPlacesForGuest({ userId: "guest-a" }, NOW, DEPS);
    assert.ok(ids(result.places).includes("hotel-a-pool"));
    assert.equal(ALL_PARTNERSHIPS.some((row) => row.placeId === "hotel-a-pool"), false, "no partnership row exists for the pool");
  });

  test("6. a Place partnered with two hotels is eligible for those hotels' guests only", async () => {
    const a = await getEligibleMapPlacesForGuest({ userId: "guest-a" }, NOW, DEPS);
    const b = await getEligibleMapPlacesForGuest({ userId: "guest-b" }, NOW, DEPS);
    assert.ok(ids(a.places).includes("shared-partner"));
    assert.ok(ids(b.places).includes("shared-partner"));
    const other = makeDeps({ "guest-c": makeStay(hotel("hotel-c", "hotel-c-place"), makeTestPlace({ id: "hotel-c-place", category: "hotel" })) });
    const c = await getEligibleMapPlacesForGuest({ userId: "guest-c" }, NOW, other);
    assert.equal(ids(c.places).includes("shared-partner"), false);
  });

  test("7. manipulated client parameters cannot bypass eligibility: no hotel/place input exists, the radius is bounded, centre only narrows", async () => {
    // The service's input type has no hotelId/placeId at all; forged extras are simply ignored.
    const forged = { userId: "guest-b", hotelId: HOTEL_A.id, placeId: partnerA.id, center: { lat: 41.7, lng: 44.8 }, radiusMeters: 1e12 } as Parameters<
      typeof getEligibleMapPlacesForGuest
    >[0];
    const result = await getEligibleMapPlacesForGuest(forged, NOW, DEPS);
    assert.equal(ids(result.places).includes("partner-a"), false, "Hotel B's guest never gets Hotel A's partner");
    assert.deepEqual(ids(result.places), ["partner-b", "shared-partner"]);
    // The radius is clamped to the server-side bounds.
    assert.equal(clampMapRadius(1e12), MAX_MAP_RADIUS_METERS);
    assert.equal(clampMapRadius(-5), MIN_MAP_RADIUS_METERS);
    assert.equal(clampMapRadius(Number.NaN), MIN_MAP_RADIUS_METERS);
  });

  test("a radius/centre can shrink the result but never add to it", async () => {
    const wide = await getEligibleMapPlacesForGuest({ userId: "guest-a" }, NOW, DEPS);
    const narrow = await getEligibleMapPlacesForGuest({ userId: "guest-a", center: { lat: 0, lng: 0 }, radiusMeters: 500 }, NOW, DEPS);
    assert.ok(narrow.places.length <= wide.places.length);
    for (const place of narrow.places) assert.ok(ids(wide.places).includes(place.id));
  });

  test("pending, revoked partnerships are excluded from discovery", async () => {
    const result = await getEligibleMapPlacesForGuest({ userId: "guest-a" }, NOW, DEPS);
    assert.equal(ids(result.places).includes("pending-place"), false);
    assert.equal(ids(result.places).includes("revoked-place"), false);
  });

  test("an expired or not-yet-started partnership is excluded when evaluated at the request time", async () => {
    const deps: EligibilityDependencies = {
      ...DEPS,
      listPartnershipsForHotel: async () => [
        partnership(HOTEL_A.id, partnerA, { endsAt: new Date("2026-06-15T11:00:00Z") }),
        partnership(HOTEL_A.id, sharedPartner, { startsAt: new Date("2026-06-16T00:00:00Z") }),
      ],
    };
    const result = await getEligibleMapPlacesForGuest({ userId: "guest-a" }, NOW, deps);
    assert.equal(ids(result.places).includes("partner-a"), false);
    assert.equal(ids(result.places).includes("shared-partner"), false);
  });
});

describe("hotel resolved only from the authenticated guest's valid active stay", () => {
  test("no stay => no recommendations (never 'everything nearby')", async () => {
    const result = await getEligibleMapPlacesForGuest({ userId: "guest-nostay" }, NOW, DEPS);
    assert.equal(result.status, "no_active_stay");
    assert.deepEqual(result.places, []);
  });

  test("a stay that has not started, or has already ended, is not a valid stay", async () => {
    const future = await getEligibleMapPlacesForGuest({ userId: "guest-future" }, NOW, DEPS);
    assert.deepEqual(future.places, []);
    assert.deepEqual(await resolveGuestHotelContext("guest-future", NOW, DEPS), { ok: false, reason: "outside_stay_period" });
    const ended = await resolveGuestHotelContext("guest-ended", NOW, DEPS);
    assert.deepEqual(ended, { ok: false, reason: "outside_stay_period" });
  });

  test("an unknown user id resolves to no hotel", async () => {
    assert.deepEqual(await resolveGuestHotelContext("someone-else", NOW, DEPS), { ok: false, reason: "no_active_stay" });
  });
});

// ---- Itinerary generation uses the same eligibility (tests 3 and 8 at the Advisor level) ----

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
    findPreferencesForUser: async () => ({ userId: "guest", principalId: null, categories: ["restaurant", "spa"], budget: null, activityLevel: null, maxDistanceMeters: null, updatedAt: NOW }),
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

describe("Advisor itinerary generation uses only eligible Places", () => {
  test("3. nearby non-partners in the database never become itinerary stops", async () => {
    const result = await generateItineraryForUser("guest", NOW, advisorDeps(makeStay(HOTEL_A, hotelAPlace), DEPS), { availableMinutes: 240 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const stopPlaceIds = result.itinerary.stops.map((s) => s.placeId);
    for (const forbidden of ["nearby-non-partner", "popular-non-partner", "pending-place", "revoked-place", "partner-b"]) {
      assert.equal(stopPlaceIds.includes(forbidden), false, `${forbidden} must not be recommended`);
    }
    for (const stop of result.itinerary.stops) {
      assert.ok(["partner-a", "shared-partner", "hotel-a-pool", hotelAPlace.id].includes(stop.placeId ?? ""), `unexpected stop ${stop.placeId}`);
    }
  });

  test("Hotel B's guest never gets Hotel A's partner in an itinerary", async () => {
    const result = await generateItineraryForUser("guest", NOW, advisorDeps(makeStay(HOTEL_B, hotelBPlace), DEPS), { availableMinutes: 240 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.itinerary.stops.some((s) => s.placeId === "partner-a"), false);
  });

  test("8. with no eligible partners or facilities the Advisor returns no_eligible_experiences — no substitutes, no hotel stop", async () => {
    const bare: EligibilityDependencies = { ...DEPS, listPartnershipsForHotel: async () => [], listFacilitiesForHotel: async () => [] };
    const result = await generateItineraryForUser("guest", NOW, advisorDeps(makeStay(HOTEL_A, hotelAPlace), bare), { availableMinutes: 240 });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "no_eligible_experiences");
    // (nearbyNonPartner / popularNonPartner sit metres from the hotel in the "database" and match the guest's interests.)
  });


  test("an itinerary already generated keeps its stop snapshot when the partnership is later revoked", async () => {
    const before = await generateItineraryForUser("guest", NOW, advisorDeps(makeStay(HOTEL_A, hotelAPlace), DEPS), { availableMinutes: 240 });
    assert.equal(before.ok, true);
    if (!before.ok) return;
    const partnerStop = before.itinerary.stops.find((s) => s.placeId === "partner-a");
    assert.ok(partnerStop, "partner-a was recommended while active");

    // Stops are self-contained snapshots (name/category/coordinates), so history stays readable after the
    // partnership is revoked — nothing about a stop references the partnership's status.
    assert.equal(partnerStop.name, partnerA.name);
    assert.equal(partnerStop.latitude, partnerA.latitude);
    assert.equal(partnerStop.category, partnerA.category);
    assert.equal("status" in partnerStop, false);

    const revoked: EligibilityDependencies = {
      ...DEPS,
      listPartnershipsForHotel: async (id) =>
        ALL_PARTNERSHIPS.filter((row) => row.hotelId === id).map((row) => (row.placeId === "partner-a" ? { ...row, status: "revoked" as const } : row)),
    };
    const after = await generateItineraryForUser("guest", NOW, advisorDeps(makeStay(HOTEL_A, hotelAPlace), revoked), { availableMinutes: 240 });
    assert.equal(after.ok, true);
    if (after.ok) assert.equal(after.itinerary.stops.some((s) => s.placeId === "partner-a"), false);
  });

  test("the hotel itself is never a stop; it is only the route origin and return point", async () => {
    const result = await generateItineraryForUser("guest", NOW, advisorDeps(makeStay(HOTEL_A, hotelAPlace), DEPS), { availableMinutes: 240 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.itinerary.stops.some((s) => s.placeId === hotelAPlace.id || s.isHotelStop), false);
  });
});

// ---- The reusable guest-level API: client-supplied ids are claims, never inputs ----

describe("listEligibleExperiencesForGuest", () => {
  test("returns Hotel A's facility and partners, distinguishable by source", async () => {
    const result = await listEligibleExperiencesForGuest({ userId: "guest-a" }, NOW, DEPS);
    assert.equal(result.status, "ok");
    const bySource = (source: string) => result.experiences.filter((e) => e.source === source).map((e) => e.place.id).sort();
    assert.deepEqual(bySource("facility"), ["hotel-a-pool"]);
    assert.deepEqual(bySource("partner"), ["partner-a", "shared-partner"]);
  });

  test("6. a Place partnered with both hotels is eligible for both guests", async () => {
    for (const userId of ["guest-a", "guest-b"]) {
      const result = await listEligibleExperiencesForGuest({ userId }, NOW, DEPS);
      assert.ok(result.experiences.some((e) => e.place.id === "shared-partner"), userId);
    }
  });

  test("category and area filters only narrow the eligible set", async () => {
    const all = await listEligibleExperiencesForGuest({ userId: "guest-a" }, NOW, DEPS);
    const spa = await listEligibleExperiencesForGuest({ userId: "guest-a", filter: { categories: ["spa"] } }, NOW, DEPS);
    assert.deepEqual(spa.experiences.map((e) => e.place.id), ["hotel-a-pool"]);
    // Asking for every category never surfaces a non-eligible Place.
    const everything = await listEligibleExperiencesForGuest(
      { userId: "guest-a", filter: { categories: ["restaurant", "spa", "attraction", "other", "museum"] } },
      NOW,
      DEPS
    );
    assert.deepEqual(ids(everything.experiences.map((e) => e.place)), ids(all.experiences.map((e) => e.place)));
  });

  test("a guest without a valid stay gets nothing, with the reason", async () => {
    assert.deepEqual(await listEligibleExperiencesForGuest({ userId: "guest-nostay" }, NOW, DEPS), { status: "no_active_stay", experiences: [] });
    assert.deepEqual(await listEligibleExperiencesForGuest({ userId: "guest-future" }, NOW, DEPS), { status: "outside_stay_period", experiences: [] });
  });

  test("8. no eligible external partners returns no external recommendations, and no substitutes", async () => {
    const noPartners: EligibilityDependencies = { ...DEPS, listPartnershipsForHotel: async () => [] };
    const result = await listEligibleExperiencesForGuest({ userId: "guest-a" }, NOW, noPartners);
    assert.equal(result.experiences.filter((e) => e.source === "partner").length, 0);
    // Only the hotel's own facility remains; nearby non-partners are not used to fill the gap.
    assert.deepEqual(result.experiences.map((e) => e.place.id), ["hotel-a-pool"]);

    const nothing: EligibilityDependencies = { ...noPartners, listFacilitiesForHotel: async () => [] };
    const empty = await listEligibleExperiencesForGuest({ userId: "guest-a" }, NOW, nothing);
    assert.deepEqual(empty.experiences, []);
  });

  test("draft or unverified Places with otherwise valid relationships are excluded end to end", async () => {
    const draft = makeTestPlace({ id: "draft-partner", category: "restaurant", latitude: 41.7001, longitude: 44.8, publicationStatus: "draft", publishedAt: null });
    const unverified = makeTestPlace({ id: "unverified-partner", category: "restaurant", latitude: 41.7001, longitude: 44.8, verificationStatus: "unverified", verifiedAt: null });
    const deps: EligibilityDependencies = {
      ...DEPS,
      listPartnershipsForHotel: async (hotelId) => [
        ...ALL_PARTNERSHIPS.filter((row) => row.hotelId === hotelId),
        partnership(hotelId, draft),
        partnership(hotelId, unverified),
      ],
    };
    const result = await listEligibleExperiencesForGuest({ userId: "guest-a" }, NOW, deps);
    assert.equal(result.experiences.some((e) => e.place.id === "draft-partner"), false);
    assert.equal(result.experiences.some((e) => e.place.id === "unverified-partner"), false);
    assert.ok(result.experiences.some((e) => e.place.id === "partner-a"));
  });
});

describe("getEligibleExperienceForGuest (any request carrying a placeId)", () => {
  test("1. returns Hotel A's explicit partner to Hotel A's guest", async () => {
    const found = await getEligibleExperienceForGuest({ userId: "guest-a", placeId: "partner-a" }, NOW, DEPS);
    assert.equal(found?.place.id, "partner-a");
    assert.equal(found?.source, "partner");
  });

  test("2. Hotel B's guest cannot obtain Hotel A's partner by supplying its placeId", async () => {
    assert.equal(await getEligibleExperienceForGuest({ userId: "guest-b", placeId: "partner-a" }, NOW, DEPS), null);
  });

  test("3. a nearby non-partner placeId is refused for every guest", async () => {
    for (const userId of ["guest-a", "guest-b"]) {
      for (const placeId of ["nearby-non-partner", "popular-non-partner"]) {
        assert.equal(await getEligibleExperienceForGuest({ userId, placeId }, NOW, DEPS), null, `${userId}/${placeId}`);
      }
    }
  });

  test("4. a Mapbox-only Place has no Atlas row, so any id it could carry is refused", async () => {
    for (const placeId of ["mapbox-poi-123", "poi.1234567890", "", "x' OR 1=1 --"]) {
      assert.equal(await getEligibleExperienceForGuest({ userId: "guest-a", placeId }, NOW, DEPS), null, placeId);
    }
  });

  test("5. a hotel-owned facility is returned to its own hotel's guest only", async () => {
    assert.equal((await getEligibleExperienceForGuest({ userId: "guest-a", placeId: "hotel-a-pool" }, NOW, DEPS))?.source, "facility");
    assert.equal(await getEligibleExperienceForGuest({ userId: "guest-b", placeId: "hotel-a-pool" }, NOW, DEPS), null);
  });

  test("pending and revoked partner placeIds are refused", async () => {
    for (const placeId of ["pending-place", "revoked-place"]) {
      assert.equal(await getEligibleExperienceForGuest({ userId: "guest-a", placeId }, NOW, DEPS), null, placeId);
    }
  });

  test("no valid stay means no placeId is ever accepted", async () => {
    for (const userId of ["guest-nostay", "guest-future", "guest-ended", "unknown-user"]) {
      assert.equal(await getEligibleExperienceForGuest({ userId, placeId: "shared-partner" }, NOW, DEPS), null, userId);
    }
  });
});

describe("authorizeGuestHotel (a client-claimed hotelId)", () => {
  test("accepts only the hotel of the guest's own valid stay", async () => {
    assert.deepEqual(await authorizeGuestHotel({ userId: "guest-a", claimedHotelId: HOTEL_A.id }, NOW, DEPS), { ok: true, hotelId: HOTEL_A.id });
  });

  test("7. a forged hotelId is refused and never widens access", async () => {
    assert.deepEqual(await authorizeGuestHotel({ userId: "guest-b", claimedHotelId: HOTEL_A.id }, NOW, DEPS), { ok: false, reason: "hotel_mismatch" });
    assert.deepEqual(await authorizeGuestHotel({ userId: "guest-a", claimedHotelId: "hotel-b" }, NOW, DEPS), { ok: false, reason: "hotel_mismatch" });
    assert.deepEqual(await authorizeGuestHotel({ userId: "guest-a", claimedHotelId: "" }, NOW, DEPS), { ok: false, reason: "hotel_mismatch" });
  });

  test("a guest with no valid stay is refused even when the claimed hotel exists", async () => {
    assert.deepEqual(await authorizeGuestHotel({ userId: "guest-nostay", claimedHotelId: HOTEL_A.id }, NOW, DEPS), { ok: false, reason: "no_active_stay" });
    assert.deepEqual(await authorizeGuestHotel({ userId: "guest-ended", claimedHotelId: HOTEL_A.id }, NOW, DEPS), { ok: false, reason: "outside_stay_period" });
  });
});
