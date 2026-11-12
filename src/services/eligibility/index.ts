import type { FacilityStatus, Hotel, Place, PlaceCategory } from "@/db/schema";
import type { LatLng } from "@/lib/geo";
import { calculateDayNumber, stayEndFor } from "@/services/advisor/stay-day";
import {
  buildEligiblePlaces,
  explainCatalogueExclusion,
  filterEligibleByRadius,
  type CatalogueExclusionReason,
  type ContractRow,
  type ExclusionInput,
  type EligiblePlace,
  type EligibilitySource,
  type FacilityRow,
  type PartnershipRow,
} from "./rules";
import { clampBounds, selectForViewport, type MapBounds } from "./viewport";

export type { CatalogueExclusionReason, EligiblePlace, EligibilitySource, Promotion } from "./rules";
export { MAP_RESULT_CAP, type MapBounds } from "./viewport";

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
 *  - Eligible = the Atlas catalogue (rules.ts): attractions, businesses with
 *    an active, confirmed, in-window Atlas contract, and active facilities
 *    owned by that hotel; published, verified, not archived; never another
 *    hotel. That hotel's partnerships only add `promotion`.
 *  - Optional filters (area, categories) can only NARROW the result, and a
 *    category filter never hides attractions.
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
  /** Every partnership row for ONE hotel (all statuses), for promotion only — rules.ts decides which promote. */
  listPartnershipsForHotel: (hotelId: string) => Promise<PartnershipRow[]>;
  listFacilitiesForHotel: (hotelId: string) => Promise<FacilityRow[]>;
  /** Candidate Atlas contracts, without other hotels' facilities, optionally only inside a map area. rules.ts decides which are eligible. */
  listContractsForCatalogue: (hotelId: string, bounds?: MapBounds) => Promise<ContractRow[]>;
  /** Candidate attraction Places, without other hotels' facilities, optionally only inside a map area. */
  listAttractionsForCatalogue: (hotelId: string, bounds?: MapBounds) => Promise<Place[]>;
};

// Lazy imports: db/queries/* start with `import "server-only"`, which throws
// outside Next's bundler. Same pattern as every other services/* module.
async function loadDefaultDependencies(): Promise<EligibilityDependencies> {
  const [staysQ, partnershipsQ, facilitiesQ, contractsQ] = await Promise.all([
    import("@/db/queries/hotel-stays"),
    import("@/db/queries/hotel-partnerships"),
    import("@/db/queries/hotel-facilities"),
    import("@/db/queries/atlas-contracts"),
  ]);
  return {
    findActiveStayForUser: staysQ.findActiveStayForUser,
    listPartnershipsForHotel: partnershipsQ.listPartnershipRowsForHotel,
    listFacilitiesForHotel: facilitiesQ.listFacilityRowsForHotel,
    listContractsForCatalogue: contractsQ.listContractRowsForCatalogue,
    listAttractionsForCatalogue: contractsQ.listAttractionPlacesForCatalogue,
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

  const day = calculateDayNumber(stay.checkIn, stayEndFor(stay), now);
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
/** Takes only what it uses — the hotel id and the hotel Place id — so an admin screen with a narrower hotel row can call it too. */
export async function listEligiblePlacesForStay(
  stay: { hotel: Pick<Hotel, "id">; place: Pick<Place, "id"> },
  now: Date = new Date(),
  deps?: Pick<
    EligibilityDependencies,
    "listPartnershipsForHotel" | "listFacilitiesForHotel" | "listContractsForCatalogue" | "listAttractionsForCatalogue"
  >,
  /** Lets the database skip catalogue Places outside a map area. Callers still filter by the area themselves. */
  bounds?: MapBounds
): Promise<EligiblePlace[]> {
  const d = deps ?? (await loadDefaultDependencies());
  const [partnerships, facilities, contracts, attractions] = await Promise.all([
    d.listPartnershipsForHotel(stay.hotel.id),
    d.listFacilitiesForHotel(stay.hotel.id),
    d.listContractsForCatalogue(stay.hotel.id, bounds),
    d.listAttractionsForCatalogue(stay.hotel.id, bounds),
  ]);
  return buildEligiblePlaces({ hotelId: stay.hotel.id, hotelPlaceId: stay.place.id, facilities, contracts, attractions, partnerships, now });
}

export type GuestExperienceFilter = {
  /** Narrow to Places near this point (defaults to the hotel when only a radius is given). */
  center?: LatLng;
  radiusMeters?: number;
  categories?: readonly PlaceCategory[];
  /** The visible map area. Narrows to Places inside it, nearest its centre first, at most MAP_RESULT_CAP. */
  bounds?: MapBounds;
};

export type GuestExperiencesResult =
  | { status: "ok"; hotelLocation: LatLng; /** The Place of the guest's own hotel: their base, never a catalogue entry. */ hotelPlaceId: string; experiences: EligiblePlace[]; truncated: boolean }
  | { status: StayFailureReason; experiences: [] };

export function clampMapRadius(radiusMeters: number): number {
  if (!Number.isFinite(radiusMeters)) return MIN_MAP_RADIUS_METERS;
  return Math.min(MAX_MAP_RADIUS_METERS, Math.max(MIN_MAP_RADIUS_METERS, radiusMeters));
}

/**
 * The general entry point. userId in, eligible experiences out. No valid
 * stay => nothing. Filters only narrow. Attractions, Atlas partners and
 * hotel-owned facilities are distinguishable via `source`.
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
  const filter = input.filter;
  const bounds = filter?.bounds ? clampBounds(filter.bounds) : undefined;
  let experiences = await listEligiblePlacesForStay(stay, now, d, bounds);
  if (filter?.categories) {
    const wanted = new Set<PlaceCategory>(filter.categories);
    // A category filter narrows businesses and facilities; attractions stay (catalogue plan §4).
    experiences = experiences.filter((entry) => entry.source === "attraction" || wanted.has(entry.place.category));
  }
  if (filter?.radiusMeters !== undefined) {
    experiences = filterEligibleByRadius(experiences, filter.center ?? hotelLocation, clampMapRadius(filter.radiusMeters));
  }
  let truncated = false;
  if (bounds) ({ places: experiences, truncated } = selectForViewport(experiences, bounds));

  return { status: "ok", hotelLocation, hotelPlaceId: stay.place.id, experiences, truncated };
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
// Admin: Guest reach
// ---------------------------------------------------------------------------

export type GuestReachHotel = { hotelId: string; hotelPlaceId: string; name: string };

export type GuestReachCandidate = {
  place: Place;
  contracts: ExclusionInput["contracts"];
  facilities: readonly { hotelId: string; status: FacilityStatus }[];
};

export type GuestReachDependencies = Pick<
  EligibilityDependencies,
  "listPartnershipsForHotel" | "listFacilitiesForHotel" | "listContractsForCatalogue" | "listAttractionsForCatalogue"
> & {
  listHotels: () => Promise<GuestReachHotel[]>;
  listCandidates: () => Promise<GuestReachCandidate[]>;
};

export type GuestReachRow = {
  place: Place;
  /** How the Place reaches guests where it does: attraction, Atlas partner, or a hotel's own facility. */
  sources: EligibilitySource[];
  /** The hotels whose guests see this Place right now, by the guest catalogue itself. */
  visibleAtHotels: { hotelId: string; name: string }[];
  /** Every hotel's guests see it (and there is at least one hotel). */
  visibleEverywhere: boolean;
  /** Hotels that promote it to their own guests ("Recommended by"). Ranking and labels only, never visibility. */
  promotedBy: { hotelId: string; name: string; featured: boolean }[];
  /** Why no guest sees it; empty when it is visible. */
  hiddenReasons: CatalogueExclusionReason[];
};

/**
 * ADMIN ONLY. What the guest catalogue shows, Place by Place, for the console's Guest reach screen. The verdict is not
 * computed here: for every hotel this runs listEligiblePlacesForStay, the same call the guest screens use, and reads
 * which Places came back and with which promotion. explainCatalogueExclusion only names the reasons a Place that came
 * back nowhere is hidden.
 */
export async function listGuestReachForAdmin(now: Date = new Date(), deps?: GuestReachDependencies): Promise<GuestReachRow[]> {
  const d = deps ?? (await loadDefaultGuestReachDependencies());
  const [hotelList, candidates] = await Promise.all([d.listHotels(), d.listCandidates()]);
  const perHotel = await Promise.all(
    hotelList.map(async (hotel) => ({
      hotel,
      eligible: await listEligiblePlacesForStay({ hotel: { id: hotel.hotelId }, place: { id: hotel.hotelPlaceId } }, now, d),
    }))
  );

  return candidates.map(({ place, contracts, facilities }) => {
    const sources = new Set<EligibilitySource>();
    const visibleAtHotels: GuestReachRow["visibleAtHotels"] = [];
    const promotedBy: GuestReachRow["promotedBy"] = [];
    for (const { hotel, eligible } of perHotel) {
      const entry = eligible.find((candidate) => candidate.place.id === place.id);
      if (!entry) continue;
      sources.add(entry.source);
      visibleAtHotels.push({ hotelId: hotel.hotelId, name: hotel.name });
      if (entry.promotion) promotedBy.push({ hotelId: hotel.hotelId, name: hotel.name, featured: entry.promotion.featured });
    }
    return {
      place,
      sources: [...sources],
      visibleAtHotels,
      visibleEverywhere: hotelList.length > 0 && visibleAtHotels.length === hotelList.length,
      promotedBy,
      hiddenReasons: visibleAtHotels.length > 0 ? [] : explainCatalogueExclusion({ place, contracts, facilities }, now),
    };
  });
}

async function loadDefaultGuestReachDependencies(): Promise<GuestReachDependencies> {
  const [base, contractsQ] = await Promise.all([loadDefaultDependencies(), import("@/db/queries/atlas-contracts")]);
  return { ...base, listHotels: contractsQ.listHotelsForGuestReach, listCandidates: contractsQ.listGuestReachCandidates };
}

// ---------------------------------------------------------------------------
// Map adapter
// ---------------------------------------------------------------------------

/** The lean shape sent to the client map: db/queries/places.ts's PlaceMapPoint plus where the eligibility came from. */
export type EligibleMapPoint = {
  id: string;
  /** An attraction, an Atlas partner, or the hotel's own facility. */
  source: EligibilitySource;
  name: string;
  description: string | null;
  category: Place["category"];
  latitude: number;
  longitude: number;
  address: string | null;
  priceLevel: number | null;
  imageUrl: string | null;
  /** The guest's own hotel recommends this partner (a promotion exists). Never set for another hotel's partnership. */
  recommended: boolean;
};

export type GuestMapPlacesResult =
  | { status: "ok"; places: EligibleMapPoint[]; hotelLocation: LatLng; hotelPlaceId: string; truncated: boolean }
  | { status: "no_active_stay"; places: []; truncated: false };

export type GuestMapPlacesInput = {
  userId: string;
  /** Optional client-supplied map area. Narrowing only. */
  center?: LatLng;
  radiusMeters?: number;
  /** Optional client-supplied visible area. Narrowing only, and capped. */
  bounds?: MapBounds;
};

/** Map-shaped view over listEligibleExperiencesForGuest — no rules of its own. */
export async function getEligibleMapPlacesForGuest(
  input: GuestMapPlacesInput,
  now: Date = new Date(),
  deps?: EligibilityDependencies
): Promise<GuestMapPlacesResult> {
  const result = await listEligibleExperiencesForGuest(
    { userId: input.userId, filter: { center: input.center, radiusMeters: input.radiusMeters, bounds: input.bounds } },
    now,
    deps
  );
  if (result.status !== "ok") return { status: "no_active_stay", places: [], truncated: false };

  return {
    status: "ok",
    hotelLocation: result.hotelLocation,
    hotelPlaceId: result.hotelPlaceId,
    truncated: result.truncated,
    places: result.experiences.map(({ place, source, promotion }) => ({
      id: place.id,
      source,
      name: place.name,
      description: place.description,
      category: place.category,
      latitude: place.latitude,
      longitude: place.longitude,
      address: place.address,
      priceLevel: place.priceLevel,
      imageUrl: place.imageUrl,
      recommended: promotion !== null,
    })),
  };
}
