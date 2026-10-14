import type { Hotel, Place, PlaceCategory } from "@/db/schema";
import type { LatLng } from "@/lib/geo";
import { calculateDayNumber } from "@/services/advisor/stay-day";
import { buildEligiblePlaces, filterEligibleByRadius, type EligiblePlace, type FacilityRow, type PartnershipRow } from "./rules";

export type { EligiblePlace, EligibilitySource } from "./rules";

/**
 * THE Atlas eligibility service — the one place that decides which Places a
 * guest may be recommended. Every recommendation, search, map result,
 * itinerary, mission, offer or booking MUST call this service; none may
 * re-implement the rule or read partnership/facility rows itself (enforced
 * by services/eligibility/guest-paths.test.ts).
 *
 * Boundary:
 *  - The only identity input is the authenticated user's id. The hotel is
 *    ALWAYS taken from that user's own valid active stay.
 *  - A client-supplied hotelId / placeId is only ever a *claim*, checked
 *    against what the stay makes eligible (authorizeGuestHotel,
 *    getEligibleExperienceForGuest). It can never select or widen anything.
 *  - Eligible = published + verified + not archived Places that are either
 *    (a) active facilities owned by that hotel, or (b) reached through an
 *    active, confirmed, in-window partnership with that same hotel.
 *  - Optional filters (area, categories) can only NARROW the result.
 */

/** Server-enforced bounds for any client-supplied map radius. The radius only narrows what is shown; it never makes a Place eligible. */
export const MIN_MAP_RADIUS_METERS = 100;
export const MAX_MAP_RADIUS_METERS = 50_000;

export type GuestStay = {
  id: string;
  checkIn: Date;
  checkOut: Date | null;
  hotel: Hotel;
  place: Place;
};

export type EligibilityDependencies = {
  /** The authenticated guest's open stay (checkOut IS NULL), or null. */
  findActiveStayForUser: (userId: string) => Promise<GuestStay | null>;
  /** Every partnership row for ONE hotel (all statuses) — rules.ts decides which are eligible. */
  listPartnershipsForHotel: (hotelId: string) => Promise<PartnershipRow[]>;
  listFacilitiesForHotel: (hotelId: string) => Promise<FacilityRow[]>;
};

// Lazy imports: db/queries/* start with `import "server-only"`, which throws
// outside Next's bundler. Same pattern as every other services/* module.
async function loadDefaultDependencies(): Promise<EligibilityDependencies> {
  const [staysQ, partnershipsQ, facilitiesQ] = await Promise.all([
    import("@/db/queries/hotel-stays"),
    import("@/db/queries/hotel-partnerships"),
    import("@/db/queries/hotel-facilities"),
  ]);
  return {
    findActiveStayForUser: staysQ.findActiveStayForUser,
    listPartnershipsForHotel: partnershipsQ.listPartnershipRowsForHotel,
    listFacilitiesForHotel: facilitiesQ.listFacilityRowsForHotel,
  };
}

// ---------------------------------------------------------------------------
// Stay -> hotel
// ---------------------------------------------------------------------------

export type StayFailureReason = "no_active_stay" | "outside_stay_period";

export type GuestHotelContext = { ok: true; stay: GuestStay } | { ok: false; reason: StayFailureReason };

/**
 * The ONLY way a feature learns "which hotel is this guest at": the
 * authenticated user's own valid active stay — open (no checkout), already
 * started, and not past its end date.
 */
export async function resolveGuestHotelContext(
  userId: string,
  now: Date = new Date(),
  deps?: Pick<EligibilityDependencies, "findActiveStayForUser">
): Promise<GuestHotelContext> {
  const d = deps ?? (await loadDefaultDependencies());
  const stay = await d.findActiveStayForUser(userId);
  if (!stay) return { ok: false, reason: "no_active_stay" };

  const day = calculateDayNumber(stay.checkIn, stay.checkOut, now);
  if (!day.ok) return { ok: false, reason: "outside_stay_period" };

  return { ok: true, stay };
}

/**
 * Checks a hotel id the CLIENT claims to be at against the authenticated
 * guest's own stay. Use this whenever a request carries a hotelId; the answer
 * is the stay's hotel, never the claimed one.
 */
export async function authorizeGuestHotel(
  input: { userId: string; claimedHotelId: string },
  now: Date = new Date(),
  deps?: Pick<EligibilityDependencies, "findActiveStayForUser">
): Promise<{ ok: true; hotelId: string } | { ok: false; reason: StayFailureReason | "hotel_mismatch" }> {
  const context = await resolveGuestHotelContext(input.userId, now, deps);
  if (!context.ok) return context;
  if (context.stay.hotel.id !== input.claimedHotelId) return { ok: false, reason: "hotel_mismatch" };
  return { ok: true, hotelId: context.stay.hotel.id };
}

// ---------------------------------------------------------------------------
// Eligible experiences
// ---------------------------------------------------------------------------

/**
 * Eligible Places for the hotel of an already-resolved stay. Takes the STAY
 * (as returned by resolveGuestHotelContext), not a bare hotel id, so a client
 * id cannot be passed in by accident. Callers that already hold the guest's
 * validated stay (e.g. the Advisor) use this; everyone else uses
 * listEligibleExperiencesForGuest.
 */
export async function listEligiblePlacesForStay(
  stay: Pick<GuestStay, "hotel" | "place">,
  now: Date = new Date(),
  deps?: Pick<EligibilityDependencies, "listPartnershipsForHotel" | "listFacilitiesForHotel">
): Promise<EligiblePlace[]> {
  const d = deps ?? (await loadDefaultDependencies());
  const [partnerships, facilities] = await Promise.all([
    d.listPartnershipsForHotel(stay.hotel.id),
    d.listFacilitiesForHotel(stay.hotel.id),
  ]);
  return buildEligiblePlaces({ hotelId: stay.hotel.id, hotelPlaceId: stay.place.id, partnerships, facilities, now });
}

export type GuestExperienceFilter = {
  /** Narrow to Places near this point (defaults to the hotel when only a radius is given). */
  center?: LatLng;
  radiusMeters?: number;
  categories?: readonly PlaceCategory[];
};

export type GuestExperiencesResult =
  | { status: "ok"; hotelLocation: LatLng; experiences: EligiblePlace[] }
  | { status: StayFailureReason; experiences: [] };

export function clampMapRadius(radiusMeters: number): number {
  if (!Number.isFinite(radiusMeters)) return MIN_MAP_RADIUS_METERS;
  return Math.min(MAX_MAP_RADIUS_METERS, Math.max(MIN_MAP_RADIUS_METERS, radiusMeters));
}

/**
 * The general entry point. userId in, eligible experiences out. No valid
 * stay => nothing. Filters only narrow. External partners and hotel-owned
 * facilities are distinguishable via `source`.
 */
export async function listEligibleExperiencesForGuest(
  input: { userId: string; filter?: GuestExperienceFilter },
  now: Date = new Date(),
  deps?: EligibilityDependencies
): Promise<GuestExperiencesResult> {
  const d = deps ?? (await loadDefaultDependencies());

  const context = await resolveGuestHotelContext(input.userId, now, d);
  if (!context.ok) return { status: context.reason, experiences: [] };

  const { stay } = context;
  const hotelLocation: LatLng = { lat: stay.place.latitude, lng: stay.place.longitude };
  let experiences = await listEligiblePlacesForStay(stay, now, d);

  const filter = input.filter;
  if (filter?.categories) {
    const wanted = new Set<PlaceCategory>(filter.categories);
    experiences = experiences.filter((entry) => wanted.has(entry.place.category));
  }
  if (filter?.radiusMeters !== undefined) {
    experiences = filterEligibleByRadius(experiences, filter.center ?? hotelLocation, clampMapRadius(filter.radiusMeters));
  }

  return { status: "ok", hotelLocation, experiences };
}

/**
 * For any request that carries a placeId (details, directions, add-to-
 * itinerary, mission, offer, booking…): returns the experience ONLY if that
 * Place is eligible for the authenticated guest's hotel, otherwise null. A
 * Place that is real but not eligible is indistinguishable from one that
 * doesn't exist.
 */
export async function getEligibleExperienceForGuest(
  input: { userId: string; placeId: string },
  now: Date = new Date(),
  deps?: EligibilityDependencies
): Promise<EligiblePlace | null> {
  const result = await listEligibleExperiencesForGuest({ userId: input.userId }, now, deps);
  if (result.status !== "ok") return null;
  return result.experiences.find((entry) => entry.place.id === input.placeId) ?? null;
}

// ---------------------------------------------------------------------------
// Map adapter
// ---------------------------------------------------------------------------

/** The lean shape sent to the client map — structurally identical to db/queries/places.ts's PlaceMapPoint. */
export type EligibleMapPoint = {
  id: string;
  name: string;
  description: string | null;
  category: Place["category"];
  latitude: number;
  longitude: number;
  address: string | null;
};

export type GuestMapPlacesResult =
  | { status: "ok"; places: EligibleMapPoint[]; hotelLocation: LatLng }
  | { status: "no_active_stay"; places: [] };

export type GuestMapPlacesInput = {
  userId: string;
  /** Optional client-supplied map area. Narrowing only. */
  center?: LatLng;
  radiusMeters?: number;
};

/** Map-shaped view over listEligibleExperiencesForGuest — no rules of its own. */
export async function getEligibleMapPlacesForGuest(
  input: GuestMapPlacesInput,
  now: Date = new Date(),
  deps?: EligibilityDependencies
): Promise<GuestMapPlacesResult> {
  const result = await listEligibleExperiencesForGuest(
    { userId: input.userId, filter: { center: input.center, radiusMeters: input.radiusMeters } },
    now,
    deps
  );
  if (result.status !== "ok") return { status: "no_active_stay", places: [] };

  return {
    status: "ok",
    hotelLocation: result.hotelLocation,
    places: result.experiences.map(({ place }) => ({
      id: place.id,
      name: place.name,
      description: place.description,
      category: place.category,
      latitude: place.latitude,
      longitude: place.longitude,
      address: place.address,
    })),
  };
}
