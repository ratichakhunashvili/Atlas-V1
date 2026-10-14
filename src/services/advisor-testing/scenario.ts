import type { ItineraryStop, Place, PlaceCategory, User, UserRole } from "@/db/schema";

// Every db/queries/* import in this file is lazy (dynamic `await import(...)`
// inside function bodies), never a static top-level import — those modules
// start with `import "server-only"`, which throws unconditionally outside
// Next's own bundler. Same reason and same fix as every other services/*
// module in Atlas (see services/advisor/generate-itinerary.ts's
// loadDefaultDependencies for the fullest write-up); here it specifically
// matters because this test file's unit tests import pure helpers and
// deleteAdvisorTestScenario from this same module, and a single static
// top-level import anywhere in the file would break that under plain
// `node --test`.

export type ScenarioType = "A" | "B" | "C" | "D" | "E" | "F";

export const SCENARIO_LABELS: Record<ScenarioType, string> = {
  A: "Normal itinerary (4 GPS hotel facilities, no partner)",
  B: "Partner itinerary (partner leads the day, no QR, plus an excluded non-partner decoy)",
  C: "QR partner (partner Place with a qrToken)",
  D: "Mixed GPS + QR (2 QR-enabled + 2 GPS-only eligible places)",
  E: "Short candidate pool (fewer eligible Places than the target stop count)",
  F: "Adaptive difficulty (seeds a completed Day 1, check-in dated yesterday)",
};

const SCENARIO_PREFIX = "advisor-test";
const SCENARIO_EMAIL_SUFFIX = "@atlas-advisor-test.invalid";

/** `advisor-test-<type>-<timestamp>` — lowercase letters/digits/hyphens only, so it's always safe to embed in an ILIKE prefix (defense in depth: listPlacesByNamePrefix/listUsersByEmailPrefix also escape independently). */
export function createScenarioTag(type: ScenarioType, now: Date = new Date()): string {
  return `${SCENARIO_PREFIX}-${type.toLowerCase()}-${now.getTime()}`;
}

/** Guards every lookup/delete below — never acts on a tag that doesn't match this exact shape, so a malformed or hostile tag can never accidentally widen a prefix match. */
export function isSafeScenarioTag(tag: string): boolean {
  return /^advisor-test-[a-f]-[0-9]+$/.test(tag);
}

export function scenarioEmail(tag: string): string {
  return `${tag}${SCENARIO_EMAIL_SUFFIX}`;
}

/** Every Place this scenario creates (including the hotel's own Place) gets a name starting with this marker — the sole mechanism for finding "every Place scenario X created," since ordinary Places have no FK back to a user/scenario the way HotelStay/ItineraryDay rows do. */
export function scenarioPlaceMarker(tag: string): string {
  return `[${tag}]`;
}

function scenarioTagFromEmail(email: string): string | null {
  if (!email.endsWith(SCENARIO_EMAIL_SUFFIX)) return null;
  const tag = email.slice(0, -SCENARIO_EMAIL_SUFFIX.length);
  return isSafeScenarioTag(tag) ? tag : null;
}

/** Recovers the scenario type from a well-formed tag (`advisor-test-<type>-<timestamp>`) — null for anything isSafeScenarioTag itself would reject. */
export function scenarioTypeFromTag(tag: string): ScenarioType | null {
  if (!isSafeScenarioTag(tag)) return null;
  const letter = tag.split("-")[2]?.toUpperCase();
  return letter && (["A", "B", "C", "D", "E", "F"] as const).includes(letter as ScenarioType) ? (letter as ScenarioType) : null;
}

/** Deterministic per-scenario coordinate island, far enough apart (0.3deg ~= 33km) to clear generateItineraryForUser's 5km candidate radius twice over between any two scenarios — otherwise two live scenarios would leak candidates into each other's itineraries. Not meant to resemble real geography. */
function scenarioOrigin(tag: string): { lat: number; lng: number } {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  }
  const gridX = hash % 60;
  const gridY = Math.floor(hash / 60) % 60;
  return { lat: 40 + gridX * 0.3, lng: 40 + gridY * 0.3 };
}

/**
 * How a scenario Place relates to the scenario's hotel — mirrors real
 * eligibility: a hotel-owned "facility", an external "partner" with an
 * ACTIVE (admin-confirmed) partnership, or "none" (a nearby decoy with no
 * relationship at all, which the Advisor must never recommend).
 */
export type ScenarioEligibility = "facility" | "partner" | "none";

type ScenarioPlaceSpec = {
  category: PlaceCategory;
  eligibility: ScenarioEligibility;
  partnerPriority?: number | null;
  hasQrToken: boolean;
  offset: { dLat: number; dLng: number };
};

type ScenarioPreset = {
  preferredCategories: PlaceCategory[];
  places: ScenarioPlaceSpec[];
  /** Backdates the HotelStay's checkIn so "today" resolves to a later dayNumber — Scenario F needs a Day 1 to already exist before generating Day 2. */
  checkInDaysAgo?: number;
};

const OFFSETS = [
  { dLat: 0.01, dLng: 0 },
  { dLat: -0.01, dLng: 0.01 },
  { dLat: 0, dLng: -0.01 },
  { dLat: 0.015, dLng: 0.015 },
  { dLat: -0.015, dLng: -0.01 },
  { dLat: 0.02, dLng: -0.02 },
] as const;

/** Pure scenario-type -> creation-parameters mapping, per the spec's six named scenario types. The caller never hand-calculates expected Advisor behavior from this — it only decides what to CREATE; generateItineraryForUser decides what happens next. */
export function scenarioPreset(type: ScenarioType): ScenarioPreset {
  switch (type) {
    case "A":
      return {
        preferredCategories: ["museum", "nature", "attraction", "activity"],
        places: [
          { category: "museum", eligibility: "facility", hasQrToken: false, offset: OFFSETS[0] },
          { category: "nature", eligibility: "facility", hasQrToken: false, offset: OFFSETS[1] },
          { category: "attraction", eligibility: "facility", hasQrToken: false, offset: OFFSETS[2] },
          { category: "activity", eligibility: "facility", hasQrToken: false, offset: OFFSETS[3] },
        ],
      };
    case "B":
      return {
        preferredCategories: ["museum", "nature", "attraction", "restaurant"],
        places: [
          { category: "museum", eligibility: "facility", hasQrToken: false, offset: OFFSETS[0] },
          { category: "nature", eligibility: "facility", hasQrToken: false, offset: OFFSETS[1] },
          { category: "attraction", eligibility: "facility", hasQrToken: false, offset: OFFSETS[2] },
          { category: "restaurant", eligibility: "partner", partnerPriority: 1, hasQrToken: false, offset: OFFSETS[3] },
          // Nearby, matching the guest's interests — but NO relationship with this hotel, so it must be excluded.
          { category: "museum", eligibility: "none", hasQrToken: false, offset: OFFSETS[4] },
        ],
      };
    case "C":
      return {
        preferredCategories: ["museum", "nature", "restaurant"],
        places: [
          { category: "museum", eligibility: "facility", hasQrToken: false, offset: OFFSETS[0] },
          { category: "nature", eligibility: "facility", hasQrToken: false, offset: OFFSETS[1] },
          { category: "restaurant", eligibility: "partner", partnerPriority: 1, hasQrToken: true, offset: OFFSETS[2] },
        ],
      };
    case "D":
      return {
        preferredCategories: ["museum", "nature", "restaurant", "landmark"],
        places: [
          { category: "museum", eligibility: "facility", hasQrToken: false, offset: OFFSETS[0] },
          { category: "restaurant", eligibility: "partner", partnerPriority: 1, hasQrToken: true, offset: OFFSETS[1] },
          { category: "nature", eligibility: "facility", hasQrToken: false, offset: OFFSETS[2] },
          { category: "landmark", eligibility: "facility", hasQrToken: true, offset: OFFSETS[3] },
        ],
      };
    case "E":
      return {
        preferredCategories: ["museum", "nature"],
        places: [
          { category: "museum", eligibility: "facility", hasQrToken: false, offset: OFFSETS[0] },
          { category: "nature", eligibility: "facility", hasQrToken: false, offset: OFFSETS[1] },
        ],
      };
    case "F":
      return {
        preferredCategories: ["museum", "nature", "attraction", "activity", "beach", "nightlife"],
        checkInDaysAgo: 1,
        places: [
          { category: "museum", eligibility: "facility", hasQrToken: false, offset: OFFSETS[0] },
          { category: "nature", eligibility: "facility", hasQrToken: false, offset: OFFSETS[1] },
          { category: "attraction", eligibility: "facility", hasQrToken: false, offset: OFFSETS[2] },
          { category: "activity", eligibility: "facility", hasQrToken: false, offset: OFFSETS[3] },
          { category: "beach", eligibility: "facility", hasQrToken: false, offset: OFFSETS[4] },
          { category: "nightlife", eligibility: "facility", hasQrToken: false, offset: OFFSETS[5] },
        ],
      };
  }
}

/** Throws in production. Exported so the guard is unit-testable independent of any DB. */
export function assertScenarioToolEnabled(nodeEnv: string | undefined): void {
  if (nodeEnv === "production") {
    throw new Error("The Advisor test-scenario tool is disabled in production.");
  }
}

export type CreatedScenario = {
  tag: string;
  type: ScenarioType;
  userId: string;
  userEmail: string;
  hotelId: string;
  hotelPlaceId: string;
  placeIds: string[];
};

/**
 * Creates one isolated test scenario: a test User (random password, never
 * logged into — the admin tool invokes services with this userId directly),
 * a Hotel (+ its own Place), the scenario's Places (hotel-owned facilities and
 * ACTIVE partnerships, some QR-enabled, plus an optional non-partner decoy), matching preferences,
 * and an active HotelStay. Every DB write goes through the same
 * db/queries/* functions the rest of Atlas uses — no raw SQL, no parallel
 * persistence path.
 */
export async function createAdvisorTestScenario(
  type: ScenarioType,
  role: UserRole = "user",
  options: { adminId: string; now?: Date; nodeEnv?: string | undefined }
): Promise<CreatedScenario> {
  // Server-side production guard, enforced HERE (not only in the calling
  // action): this tool writes ACTIVE partnerships/facilities, bypassing the
  // normal admin confirmation workflow, so it must never run in production.
  assertScenarioToolEnabled(options.nodeEnv ?? process.env.NODE_ENV);
  const now = options.now ?? new Date();

  const [usersQ, placesQ, hotelsQ, partnershipsQ, facilitiesQ, hotelStaysQ, preferencesQ, bcryptModule] = await Promise.all([
    import("@/db/queries/users"),
    import("@/db/queries/places"),
    import("@/db/queries/hotels"),
    import("@/db/queries/hotel-partnerships"),
    import("@/db/queries/hotel-facilities"),
    import("@/db/queries/hotel-stays"),
    import("@/db/queries/preferences"),
    import("bcryptjs"),
  ]);
  const crypto = await import("node:crypto");

  const tag = createScenarioTag(type, now);
  const marker = scenarioPlaceMarker(tag);
  const email = scenarioEmail(tag);
  const origin = scenarioOrigin(tag);
  const preset = scenarioPreset(type);

  const passwordHash = await bcryptModule.hash(crypto.randomBytes(32).toString("hex"), 10);
  const user = await usersQ.createUser({ email, passwordHash });
  if (role === "admin") await usersQ.setUserRole(email, "admin");

  const hotelPlace = await placesQ.createPlace({
    name: `${marker} Hotel`,
    latitude: origin.lat,
    longitude: origin.lng,
    category: "hotel",
    publicationStatus: "published",
    verificationStatus: "verified",
  });
  const hotel = await hotelsQ.createHotel({ placeId: hotelPlace.id, qrToken: `${tag}-hotel-qr` });

  const placeIds: string[] = [];
  const categories = new Set<PlaceCategory>();
  for (const [index, spec] of preset.places.entries()) {
    const qrSuffix = spec.hasQrToken ? ", qr" : "";
    const eligibilitySuffix = spec.eligibility === "partner" ? ", partner" : spec.eligibility === "facility" ? ", facility" : ", non-partner decoy";
    const place = await placesQ.createPlace({
      name: `${marker} Place ${index + 1} (${spec.category}${eligibilitySuffix}${qrSuffix})`,
      latitude: origin.lat + spec.offset.dLat,
      longitude: origin.lng + spec.offset.dLng,
      category: spec.category,
      qrToken: spec.hasQrToken ? `${tag}-place-${index + 1}-qr` : null,
      // Test data only. Published + verified so eligibility is decided purely by the facility/partnership row
      // (the "none" decoy is still excluded: it has no relationship with the hotel).
      publicationStatus: "published",
      verificationStatus: "verified",
    });
    placeIds.push(place.id);
    categories.add(spec.category);
    if (spec.eligibility === "partner") {
      // Created as an explicit admin confirmation: attributed to the admin running the tool (taken from the
      // authenticated session by the caller, never from a form value).
      const partnership = await partnershipsQ.createPendingPartnership({ hotelId: hotel.id, placeId: place.id });
      if (!partnership) throw new Error("Scenario setup failed: duplicate partnership.");
      await partnershipsQ.transitionPartnership(partnership.id, ["pending_review"], {
        status: "active",
        priority: spec.partnerPriority ?? null,
        confirmedBy: options.adminId,
        confirmedAt: now,
      });
    } else if (spec.eligibility === "facility") {
      await facilitiesQ.createFacility({
        hotelId: hotel.id,
        placeId: place.id,
        facilityType: spec.category === "restaurant" ? "dining" : "other",
      });
    }
  }

  await preferencesQ.upsertPreferences(user.id, { categories: [...categories], budget: null, activityLevel: null });

  const checkIn = new Date(now);
  if (preset.checkInDaysAgo) checkIn.setUTCDate(checkIn.getUTCDate() - preset.checkInDaysAgo);
  await hotelStaysQ.createHotelStay({ userId: user.id, hotelId: hotel.id, checkIn });

  return { tag, type, userId: user.id, userEmail: email, hotelId: hotel.id, hotelPlaceId: hotelPlace.id, placeIds };
}

export type ScenarioState = {
  tag: string;
  user: User;
  hotelId: string;
  hotelStayId: string;
  hotelPlace: Place;
  checkIn: Date;
  checkOut: Date | null;
  /** Every Place the scenario created, including the hotel's own Place — resolved purely from the naming marker, since ordinary Places have no FK back to a scenario. */
  places: Place[];
  /** placeId -> priority, for every Place with an ACTIVE, confirmed partnership with this scenario's hotel. */
  partnerPlaceIds: Map<string, number | null>;
};

export async function findAdvisorTestScenario(tag: string): Promise<ScenarioState | null> {
  if (!isSafeScenarioTag(tag)) return null;

  const [usersQ, placesQ, hotelStaysQ, eligibilityM] = await Promise.all([
    import("@/db/queries/users"),
    import("@/db/queries/places"),
    import("@/db/queries/hotel-stays"),
    import("@/services/eligibility"),
  ]);

  const user = await usersQ.findUserByEmail(scenarioEmail(tag));
  if (!user) return null;

  const stay = await hotelStaysQ.findCurrentStayForUser(user.id);
  if (!stay) return null;

  const places = await placesQ.listPlacesByNamePrefix(scenarioPlaceMarker(tag));
  // Exactly what the Advisor itself sees: eligible partners only (active + confirmed + in-window).
  const eligible = await eligibilityM.listEligiblePlacesForStay(stay);
  const partnerPlaceIds = new Map(eligible.filter((entry) => entry.source === "partner").map((entry) => [entry.place.id, entry.priority]));

  return {
    tag,
    user,
    hotelId: stay.hotel.id,
    hotelStayId: stay.id,
    hotelPlace: stay.place,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    places,
    partnerPlaceIds,
  };
}

export type ScenarioSummary = { tag: string; type: ScenarioType; email: string; createdAt: Date; role: UserRole };

export async function listAdvisorTestScenarios(): Promise<ScenarioSummary[]> {
  const { listUsersByEmailPrefix } = await import("@/db/queries/users");
  const rows = await listUsersByEmailPrefix(`${SCENARIO_PREFIX}-`);

  const scenarios: ScenarioSummary[] = [];
  for (const row of rows) {
    const tag = scenarioTagFromEmail(row.email);
    if (!tag) continue;
    const type = scenarioTypeFromTag(tag);
    if (!type) continue;
    scenarios.push({ tag, type, email: row.email, createdAt: row.createdAt, role: row.role });
  }
  return scenarios.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export type SeededHistoryOutcome = "easy" | "hard" | "incomplete";

/**
 * Directly seeds a historical, already-completed "Day 1" (or leaves it
 * incomplete) with the exact facts calculateNextStopCount (services/advisor/
 * difficulty.ts) actually reads: stopCount, every stop's visitedAt,
 * completedAt, generatedAt, totalDurationSeconds. This is the one place in
 * the admin-testing tool that writes itinerary_days/itinerary_stops
 * directly instead of through persistItinerary — persistItinerary's shape
 * is for the real generation flow (it requires real routing output), not
 * for fabricating arbitrary test history, and no existing function creates
 * historical days at all. The actual Day 2 generation the admin runs
 * afterward still goes through the real generateItineraryForUser.
 */
export async function seedPreviousDayHistory(
  tag: string,
  outcome: SeededHistoryOutcome,
  stopCount = 4
): Promise<{ dayId: string } | null> {
  const scenario = await findAdvisorTestScenario(tag);
  if (!scenario) return null;

  const { db } = await import("@/db");
  const { itineraryDays, itineraryStops } = await import("@/db/schema");

  const generatedAt = new Date(scenario.checkIn);
  const totalDurationSeconds = 7200;
  const completedAt =
    outcome === "incomplete"
      ? null
      : outcome === "easy"
        ? new Date(generatedAt.getTime() + totalDurationSeconds * 1000 * 0.25) // well under the 50% ratio -> easy
        : new Date(generatedAt.getTime() + totalDurationSeconds * 1000 * 0.75); // over the 50% ratio -> not easy

  const [day] = await db
    .insert(itineraryDays)
    .values({
      userId: scenario.user.id,
      hotelId: scenario.hotelId,
      hotelStayId: scenario.hotelStayId,
      dayNumber: 1,
      stopCount,
      routeGeoJson: null,
      totalDurationSeconds,
      generatedAt,
      completedAt,
    })
    .returning();

  // Synthetic history only — the difficulty ratchet reads stopCount/visited
  // state/timestamps, never which specific Places were visited, so reusing
  // one Place for every seeded stop is intentional, not an oversight.
  const samplePlace = scenario.places.find((p) => p.id !== scenario.hotelPlace.id) ?? scenario.hotelPlace;
  const stops: Array<typeof itineraryStops.$inferInsert> = Array.from({ length: stopCount }, (_, index) => ({
    dayId: day.id,
    placeId: samplePlace.id,
    isHotelStop: false,
    checkInMethod: "gps",
    name: samplePlace.name,
    category: samplePlace.category,
    latitude: samplePlace.latitude,
    longitude: samplePlace.longitude,
    imageUrl: samplePlace.imageUrl,
    position: index,
    visitedAt: outcome === "incomplete" && index === stopCount - 1 ? null : generatedAt,
  }));
  await db.insert(itineraryStops).values(stops);

  return { dayId: day.id };
}

export type DeleteScenarioDependencies = {
  findUserByEmail: (email: string) => Promise<{ id: string } | null>;
  findCurrentStayForUser: (userId: string) => Promise<{ hotel: { id: string } } | null>;
  listPlacesByNamePrefix: (prefix: string) => Promise<Array<{ id: string }>>;
  deleteUser: (id: string) => Promise<void>;
  deleteHotel: (id: string) => Promise<void>;
  deletePlace: (id: string) => Promise<void>;
};

async function loadDeleteDependencies(): Promise<DeleteScenarioDependencies> {
  const [usersQ, placesQ, hotelStaysQ, hotelsQ] = await Promise.all([
    import("@/db/queries/users"),
    import("@/db/queries/places"),
    import("@/db/queries/hotel-stays"),
    import("@/db/queries/hotels"),
  ]);
  return {
    findUserByEmail: usersQ.findUserByEmail,
    findCurrentStayForUser: hotelStaysQ.findCurrentStayForUser,
    listPlacesByNamePrefix: placesQ.listPlacesByNamePrefix,
    deleteUser: usersQ.deleteUser,
    deleteHotel: hotelsQ.deleteHotel,
    deletePlace: placesQ.deletePlace,
  };
}

export type DeleteScenarioResult = { deleted: true } | { deleted: false; reason: "unsafe_tag" | "not_found" };

/**
 * Deletes exactly one scenario's data, nothing else. Order matters:
 * hotels.placeId is NOT NULL with onDelete:"restrict", so the hotel row
 * must be gone before its own Place can be deleted. The user is deleted
 * first — this cascades hotel_stays, itinerary_days (which cascades
 * itinerary_stops), and user_preferences automatically via their existing
 * FK rules, so this function never touches those tables directly. Refuses
 * to run at all against a tag that doesn't match the scenario format,
 * so a malformed tag can never widen into deleting unrelated data.
 */
export async function deleteAdvisorTestScenario(
  tag: string,
  deps?: DeleteScenarioDependencies
): Promise<DeleteScenarioResult> {
  if (!isSafeScenarioTag(tag)) return { deleted: false, reason: "unsafe_tag" };

  const d = deps ?? (await loadDeleteDependencies());

  const user = await d.findUserByEmail(scenarioEmail(tag));
  if (!user) return { deleted: false, reason: "not_found" };

  const stay = await d.findCurrentStayForUser(user.id);
  const places = await d.listPlacesByNamePrefix(scenarioPlaceMarker(tag));

  await d.deleteUser(user.id);
  if (stay) await d.deleteHotel(stay.hotel.id);
  for (const place of places) await d.deletePlace(place.id);

  return { deleted: true };
}

export type ItineraryInspectorStop = {
  stop: ItineraryStop;
  isPartner: boolean;
  qrToken: string | null;
};

/**
 * Enriches persisted stops with facts the snapshot alone can't show — partner
 * status and the live Place's qrToken (both deliberately NOT snapshotted
 * onto itinerary_stops, since they're facts about the current Place, not
 * historical facts about the day). Pure presentation assembly for the
 * inspector; no business logic.
 */
export async function inspectItineraryStops(
  stops: readonly ItineraryStop[],
  partnerPlaceIds: ReadonlyMap<string, number | null>
): Promise<ItineraryInspectorStop[]> {
  const { findPlaceById } = await import("@/db/queries/places");
  return Promise.all(
    stops.map(async (stop) => {
      const place = stop.placeId ? await findPlaceById(stop.placeId) : null;
      return {
        stop,
        isPartner: stop.placeId ? partnerPlaceIds.has(stop.placeId) : false,
        qrToken: place?.qrToken ?? null,
      };
    })
  );
}
