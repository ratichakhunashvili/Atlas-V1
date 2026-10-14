import { buildEligiblePlaces, type EligiblePlace } from "@/services/eligibility/rules";
import { DEMO_DATA, type DemoData, type DemoHotel } from "./fixtures";

/**
 * Prototype eligibility, kept separate from the UI so it is easy to test.
 *
 * It does NOT re-implement the Atlas rule: it scopes the fixture rows to one
 * hotel and hands them to the same pure rule the production service uses
 * (services/eligibility/rules.ts). That rule returns only
 *   (a) active facilities OWNED by this hotel, and
 *   (b) external Places with an active, confirmed partnership with THIS hotel.
 * A nearby or popular Place with no relationship is never returned.
 */

/** The hotel is identified ONLY from the demo QR token, never from other URL parameters. */
export function findDemoHotelByQrToken(token: string, data: DemoData = DEMO_DATA): DemoHotel | null {
  return data.hotels.find((hotel) => hotel.demoQrToken === token) ?? null;
}

export function getEligibleExperiencesForDemoHotel(
  hotelId: string,
  now: Date = new Date(),
  data: DemoData = DEMO_DATA
): EligiblePlace[] {
  const hotel = data.hotels.find((candidate) => candidate.id === hotelId);
  if (!hotel) return [];

  return buildEligiblePlaces({
    hotelId: hotel.id,
    hotelPlaceId: hotel.placeId,
    partnerships: data.partnerships.filter((row) => row.hotelId === hotel.id),
    facilities: data.facilities.filter((row) => row.hotelId === hotel.id),
    now,
  });
}
