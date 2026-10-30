import type { Place, PlaceCategory } from "@/db/schema";

let counter = 0;

/** Deterministic, UUID-shaped id for the Nth default fixture in a file (each test file runs in its own process, so N is stable). */
function stableTestId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/** Minimal, deterministic Place fixture for tests — never imported outside test files. */
export function makeTestPlace(overrides: Partial<Place> & { category: PlaceCategory }): Place {
  counter += 1;
  return {
    id: overrides.id ?? stableTestId(counter),
    name: overrides.name ?? `Test Place ${counter}`,
    description: overrides.description ?? null,
    latitude: overrides.latitude ?? 0,
    longitude: overrides.longitude ?? 0,
    category: overrides.category,
    address: overrides.address ?? null,
    imageUrl: overrides.imageUrl ?? null,
    website: overrides.website ?? null,
    phone: overrides.phone ?? null,
    qrToken: overrides.qrToken ?? null,
    visitDurationMinutes: overrides.visitDurationMinutes ?? null,
    priceLevel: overrides.priceLevel ?? null,
    priceLevelSource: overrides.priceLevelSource ?? (overrides.priceLevel ? "test fixture" : null),
    priceLevelVerifiedAt: overrides.priceLevelVerifiedAt ?? (overrides.priceLevel ? new Date("2026-01-01T00:00:00Z") : null),
    archivedAt: overrides.archivedAt ?? null,
    publicationStatus: overrides.publicationStatus ?? "published",
    publishedAt: overrides.publishedAt ?? new Date("2026-01-01T00:00:00Z"),
    verificationStatus: overrides.verificationStatus ?? "verified",
    verifiedAt: overrides.verifiedAt ?? new Date("2026-01-01T00:00:00Z"),
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-01-01T00:00:00Z"),
  };
}

// ---- Availability fixtures for tests that don't care about eligibility ----
// Matches the default day factories used in the check-in / current-itinerary tests (stay-1 at hotel-1).
import type { AvailabilityContext, AvailabilityContextLoader } from "./stop-availability";

export const ALL_AVAILABLE_CONTEXT: AvailabilityContext = {
  stay: { id: "stay-1", hotelId: "hotel-1", dayNumber: 1 },
  eligiblePlaceIds: { has: () => true } as unknown as ReadonlySet<string>,
};

export const loadAllAvailable: AvailabilityContextLoader = async () => ALL_AVAILABLE_CONTEXT;

// ---- Permanent-visit recording, for check-in tests ----
import type { CheckInDependencies } from "./check-in";

/**
 * A stand-in for the real recording operation.
 *
 * Tests that care assert on the calls it received: a refused check-in must leave
 * this untouched, which is how "a failed check-in creates no visit and no unlock"
 * is proved without a database.
 */
export function createVisitRecorder() {
  const calls: Array<{ userId: string; placeId: string; method: string }> = [];

  const record: CheckInDependencies["recordVerifiedVisit"] = async (input) => {
    calls.push({ userId: input.userId, placeId: input.placeId, method: input.method });
    return {
      visit: {
        id: "visit-1",
        userId: input.userId,
        principalId: null,
        placeId: input.placeId,
        firstVisitedAt: input.now,
        lastVisitedAt: input.now,
        visitCount: 1,
        firstVerificationMethod: input.method,
      },
      unlockedAchievement: null,
      firstVisit: true,
    };
  };

  return { record, calls };
}

/** The same recorder for tests that only need the dependency satisfied. */
export const fakeRecordVerifiedVisit: CheckInDependencies["recordVerifiedVisit"] =
  createVisitRecorder().record;
