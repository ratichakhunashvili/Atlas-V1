import type { FacilityStatus, FacilityType, Place, PartnershipStatus } from "@/db/schema";
import { distanceMeters, type LatLng } from "@/lib/geo";

/**
 * The single definition of "may this Place be recommended to this hotel's
 * guests". Pure: no DB, no clock reads (`now` is always passed in).
 *
 * Eligible = (a) a facility the hotel itself OWNS, or (b) an external Place
 * with an explicitly confirmed, active, in-window partnership with THIS
 * hotel. Nothing else — not nearness, popularity, presence in Atlas's
 * `places` table, or presence in Mapbox.
 */

export type EligibilitySource = "partner" | "facility";

export type EligiblePlace = {
  place: Place;
  source: EligibilitySource;
  /** hotel_partnerships.id or hotel_facilities.id, depending on `source`. */
  relationId: string;
  priority: number | null;
  facilityType: FacilityType | null;
  /** Featured by this hotel (partners only; always false for a facility). Ranking and presentation only. */
  featured: boolean;
  /** This hotel's offer for the partner, shown as written. Always null for a facility. */
  offerText: string | null;
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
 * The Place itself must be fit to show: published (an admin decided it is
 * ready), verified (an admin confirmed it is real and correctly described),
 * and not archived. Applies to facilities AND external partners.
 */
export function isPlaceRecommendable(place: Pick<Place, "publicationStatus" | "verificationStatus" | "archivedAt">): boolean {
  return place.publicationStatus === "published" && place.verificationStatus === "verified" && place.archivedAt === null;
}

export function isPartnershipEligible(row: PartnershipRow, hotelId: string, now: Date): boolean {
  if (row.hotelId !== hotelId) return false; // a partnership with Hotel A never applies to Hotel B
  if (row.status !== "active") return false; // pending_review / suspended / revoked
  if (row.confirmedAt === null) return false; // never eligible without explicit admin confirmation
  if (row.startsAt !== null && row.startsAt.getTime() > now.getTime()) return false; // not started yet
  if (row.endsAt !== null && row.endsAt.getTime() <= now.getTime()) return false; // expired
  if (!isPlaceRecommendable(row.place)) return false; // draft / unverified / archived
  return true;
}

export function isFacilityEligible(row: FacilityRow, hotelId: string): boolean {
  if (row.hotelId !== hotelId) return false;
  if (row.status !== "active") return false;
  if (!isPlaceRecommendable(row.place)) return false;
  return true;
}

export type BuildEligiblePlacesInput = {
  hotelId: string;
  /** The hotel's own Place: never an external partner/destination of itself. */
  hotelPlaceId: string;
  partnerships: readonly PartnershipRow[];
  facilities: readonly FacilityRow[];
  now: Date;
};

/**
 * Both inputs are expected to be pre-scoped to `hotelId` by the caller; the
 * hotelId re-checks here are defense in depth, so a caller bug can never
 * leak another hotel's rows through.
 */
export function buildEligiblePlaces(input: BuildEligiblePlacesInput): EligiblePlace[] {
  const { hotelId, hotelPlaceId, partnerships, facilities, now } = input;
  const result: EligiblePlace[] = [];
  const seen = new Set<string>([hotelPlaceId]);

  // Facilities first so a Place that is (wrongly) in both tables is reported
  // as the hotel's own facility, once.
  for (const row of facilities) {
    if (!isFacilityEligible(row, hotelId) || seen.has(row.place.id)) continue;
    seen.add(row.place.id);
    result.push({ place: row.place, source: "facility", relationId: row.id, priority: null, facilityType: row.facilityType, featured: false, offerText: null });
  }

  for (const row of partnerships) {
    if (!isPartnershipEligible(row, hotelId, now) || seen.has(row.place.id)) continue;
    seen.add(row.place.id);
    result.push({ place: row.place, source: "partner", relationId: row.id, priority: row.priority,
      facilityType: null,
      featured: row.featured,
      offerText: row.offerText,
    });
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
