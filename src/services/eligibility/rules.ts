import type { AtlasContractStatus, FacilityStatus, FacilityType, Place, PartnershipStatus } from "@/db/schema";
import { distanceMeters, type LatLng } from "@/lib/geo";

/**
 * The single definition of "may this Place be shown to this hotel's guests": the Atlas catalogue rule
 * (docs/catalogue-model-plan.md §2). Pure: no DB, no clock reads (`now` is always passed in).
 *
 *   catalogue(H, now) =
 *       attractions (places.kind = "attraction")
 *     ∪ businesses with an active, confirmed, in-window Atlas contract
 *     ∪ active facilities owned by H
 *     − every hotel Place (H's own is the base, never a destination)
 *   and every Place must be published, verified and not archived.
 *
 * A hotel partnership never makes a Place visible. It only PROMOTES an Atlas partner, for H's guests, and promotes
 * nothing once that partner's contract has lapsed. Nearness, popularity, presence in the database or in Mapbox count
 * for nothing.
 */

export type EligibilitySource = "attraction" | "partner" | "facility";

/** How H promotes an Atlas partner to its own guests. Ranking and presentation only, never visibility. */
export type Promotion = {
  partnershipId: string;
  priority: number | null;
  featured: boolean;
  /** This hotel's offer, shown as written. */
  offerText: string | null;
};

export type EligiblePlace = {
  place: Place;
  source: EligibilitySource;
  /** atlas_partner_contracts.id, hotel_facilities.id, or the Place id for an attraction. */
  relationId: string;
  facilityType: FacilityType | null;
  /** Only ever set on a `partner`, and only from the guest's own hotel's partnership. */
  promotion: Promotion | null;
};

export type ContractRow = {
  id: string;
  placeId: string;
  status: AtlasContractStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  confirmedAt: Date | null;
  place: Place;
};

export type PartnershipRow = {
  id: string;
  hotelId: string;
  placeId: string;
  status: PartnershipStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  confirmedAt: Date | null;
  priority: number | null;
  featured: boolean;
  offerText: string | null;
  place: Place;
};

export type FacilityRow = {
  id: string;
  hotelId: string;
  placeId: string;
  status: FacilityStatus;
  facilityType: FacilityType;
  place: Place;
};

/**
 * The Place itself must be fit to show: published (an admin decided it is ready), verified (an admin confirmed it is
 * real and correctly described), and not archived. Applies to every source.
 */
export function isPlaceRecommendable(place: Pick<Place, "publicationStatus" | "verificationStatus" | "archivedAt">): boolean {
  return place.publicationStatus === "published" && place.verificationStatus === "verified" && place.archivedAt === null;
}

function isInWindow(row: { startsAt: Date | null; endsAt: Date | null }, now: Date): boolean {
  if (row.startsAt !== null && row.startsAt.getTime() > now.getTime()) return false; // not started yet
  if (row.endsAt !== null && row.endsAt.getTime() <= now.getTime()) return false; // expired
  return true;
}

/** An Atlas contract puts a business in the catalogue only while active, explicitly confirmed and in its window. */
export function isContractEligible(row: ContractRow, now: Date): boolean {
  if (row.status !== "active") return false; // pending_review / suspended / ended
  if (row.confirmedAt === null) return false;
  if (!isInWindow(row, now)) return false;
  if (row.place.kind !== "business") return false; // an attraction needs no contract; a hotel never gets one
  return isPlaceRecommendable(row.place);
}

export function isAttractionEligible(place: Place): boolean {
  return place.kind === "attraction" && isPlaceRecommendable(place);
}

/** Whether this hotel's partnership may PROMOTE. Visibility is the contract's job, never the partnership's. */
export function isPartnershipEligible(row: PartnershipRow, hotelId: string, now: Date): boolean {
  if (row.hotelId !== hotelId) return false; // a partnership with Hotel A never applies to Hotel B
  if (row.status !== "active") return false;
  if (row.confirmedAt === null) return false;
  return isInWindow(row, now);
}

export function isFacilityEligible(row: FacilityRow, hotelId: string): boolean {
  if (row.hotelId !== hotelId) return false;
  if (row.status !== "active") return false;
  return isPlaceRecommendable(row.place);
}

/**
 * A hotel is never a destination (CLAUDE.md: other hotels must not appear), even if a contract, facility or
 * attraction row wrongly points at one. Hotel anchor Places are kind "hotel"; the category check also catches a
 * hotel Place not yet linked to a hotel.
 */
export function isHotelPlace(place: Pick<Place, "kind" | "category">): boolean {
  return place.kind === "hotel" || place.category === "hotel";
}

export type BuildEligiblePlacesInput = {
  hotelId: string;
  /** The hotel's own Place: the base, never a destination of itself. */
  hotelPlaceId: string;
  /** This hotel's facilities (re-checked against hotelId here). */
  facilities: readonly FacilityRow[];
  /** Candidate Atlas contracts, shared by every hotel's guests. The caller excludes other hotels' facilities. */
  contracts: readonly ContractRow[];
  /** Candidate attraction Places. */
  attractions: readonly Place[];
  /** This hotel's partnerships, for promotion only (re-checked against hotelId here). */
  partnerships: readonly PartnershipRow[];
  now: Date;
};

export function buildEligiblePlaces(input: BuildEligiblePlacesInput): EligiblePlace[] {
  const { hotelId, hotelPlaceId, facilities, contracts, attractions, partnerships, now } = input;
  const result: EligiblePlace[] = [];
  const seen = new Set<string>([hotelPlaceId]);

  // Facilities first, so a Place that is (wrongly) also contracted is reported once, as the hotel's own.
  for (const row of facilities) {
    if (!isFacilityEligible(row, hotelId) || isHotelPlace(row.place) || seen.has(row.place.id)) continue;
    seen.add(row.place.id);
    result.push({ place: row.place, source: "facility", relationId: row.id, facilityType: row.facilityType, promotion: null });
  }

  for (const place of attractions) {
    if (!isAttractionEligible(place) || isHotelPlace(place) || seen.has(place.id)) continue;
    seen.add(place.id);
    result.push({ place, source: "attraction", relationId: place.id, facilityType: null, promotion: null });
  }

  const promotions = new Map<string, Promotion>();
  for (const row of partnerships) {
    if (!isPartnershipEligible(row, hotelId, now) || promotions.has(row.placeId)) continue;
    promotions.set(row.placeId, { partnershipId: row.id, priority: row.priority, featured: row.featured, offerText: row.offerText });
  }

  for (const row of contracts) {
    if (!isContractEligible(row, now) || isHotelPlace(row.place) || seen.has(row.place.id)) continue;
    seen.add(row.place.id);
    result.push({ place: row.place, source: "partner", relationId: row.id, facilityType: null, promotion: promotions.get(row.place.id) ?? null });
  }

  return result;
}

/** Radius filter + nearest-first sort over an already-eligible set. Narrows what the map shows; can never add a Place. */
export function filterEligibleByRadius(places: readonly EligiblePlace[], center: LatLng, radiusMeters: number): EligiblePlace[] {
  return places
    .map((entry) => ({
      entry,
      distance: distanceMeters(center, { lat: entry.place.latitude, lng: entry.place.longitude }),
    }))
    .filter(({ distance }) => distance <= radiusMeters)
    .sort((a, b) => a.distance - b.distance)
    .map(({ entry }) => entry);
}
