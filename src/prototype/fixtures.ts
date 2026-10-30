import type { Place } from "@/db/schema";
import type { FacilityRow, PartnershipRow } from "@/services/eligibility/rules";

/**
 * PROTOTYPE FIXTURES — typed, local, in-memory demo data for the /demo guest
 * flow. These are NOT production API responses and are never read from or
 * written to a database. They reuse the production row shapes
 * (PartnershipRow / FacilityRow) so the real eligibility rule can run on them
 * unchanged.
 */

export type DemoHotel = {
  id: string;
  name: string;
  tagline: string;
  placeId: string;
  /** A readable stand-in for the opaque, hashed QR tokens the real product will use. Prototype only. */
  demoQrToken: string;
};

export type DemoData = {
  hotels: readonly DemoHotel[];
  partnerships: readonly PartnershipRow[];
  facilities: readonly FacilityRow[];
};

const FIXTURE_DATE = new Date("2026-01-01T00:00:00Z");

/**
 * Stable, fixed ids (valid UUIDs, so they can be used as-is by a future seed). They never depend on test
 * order, counters or randomness, so assertions and snapshots stay reproducible.
 */
export const DEMO_IDS = {
  placeHotelA: "00000000-0000-4000-8000-000000000011",
  placeHotelB: "00000000-0000-4000-8000-000000000012",
  placeWineCellar: "00000000-0000-4000-8000-000000000021",
  placeCableCar: "00000000-0000-4000-8000-000000000022",
  placeRooftopSpa: "00000000-0000-4000-8000-000000000023",
  placeCornerCafe: "00000000-0000-4000-8000-000000000024",
  hotelA: "00000000-0000-4000-8000-000000000031",
  hotelB: "00000000-0000-4000-8000-000000000032",
  partnershipAWine: "00000000-0000-4000-8000-000000000041",
  partnershipACableCar: "00000000-0000-4000-8000-000000000042",
  partnershipBCableCar: "00000000-0000-4000-8000-000000000043",
  facilityARooftopSpa: "00000000-0000-4000-8000-000000000051",
} as const;

function fixturePlace(
  fields: Pick<Place, "id" | "name" | "description" | "latitude" | "longitude" | "category" | "address">
): Place {
  return {
    ...fields,
    imageUrl: null,
    website: null,
    phone: null,
    qrToken: null,
    visitDurationMinutes: null,
    priceLevel: null,
    priceLevelSource: null,
    priceLevelVerifiedAt: null,
    archivedAt: null,
    publicationStatus: "published",
    publishedAt: FIXTURE_DATE,
    verificationStatus: "verified",
    verifiedAt: FIXTURE_DATE,
    createdAt: FIXTURE_DATE,
    updatedAt: FIXTURE_DATE,
  };
}

// ---- Hotels (each is itself a Place, as in the real model) ----

const hotelAPlace = fixturePlace({
  id: DEMO_IDS.placeHotelA,
  name: "Hotel A",
  description: "Old Town boutique hotel.",
  latitude: 41.6938,
  longitude: 44.8015,
  category: "hotel",
  address: "Old Town, Tbilisi",
});

const hotelBPlace = fixturePlace({
  id: DEMO_IDS.placeHotelB,
  name: "Hotel B",
  description: "Park-side hotel in Vake.",
  latitude: 41.709,
  longitude: 44.769,
  category: "hotel",
  address: "Vake, Tbilisi",
});

export const DEMO_HOTEL_A: DemoHotel = {
  id: DEMO_IDS.hotelA,
  name: "Hotel A",
  tagline: "Old Town boutique hotel",
  placeId: hotelAPlace.id,
  demoQrToken: "demo-qr-hotel-a",
};

export const DEMO_HOTEL_B: DemoHotel = {
  id: DEMO_IDS.hotelB,
  name: "Hotel B",
  tagline: "Park-side hotel in Vake",
  placeId: hotelBPlace.id,
  demoQrToken: "demo-qr-hotel-b",
};

// ---- The four experience Places ----

/** External Place partnered ONLY with Hotel A. */
export const WINE_CELLAR = fixturePlace({
  id: DEMO_IDS.placeWineCellar,
  name: "Old Town Wine Cellar",
  description: "Tasting of Georgian qvevri wines with small plates.",
  latitude: 41.6931,
  longitude: 44.8029,
  category: "restaurant",
  address: "Old Town, Tbilisi",
});

/** External Place partnered with BOTH hotels. */
export const CABLE_CAR = fixturePlace({
  id: DEMO_IDS.placeCableCar,
  name: "Funicular & Mtatsminda Park",
  description: "Ride the funicular up for views over the whole city.",
  latitude: 41.6955,
  longitude: 44.7926,
  category: "attraction",
  address: "Mtatsminda, Tbilisi",
});

/** A facility OWNED by Hotel A (not an external partner). */
export const ROOFTOP_SPA = fixturePlace({
  id: DEMO_IDS.placeRooftopSpa,
  name: "Hotel A Rooftop Spa",
  description: "Hotel A's own spa and sauna, open to its guests.",
  latitude: 41.6938,
  longitude: 44.8016,
  category: "spa",
  address: "Hotel A, Old Town, Tbilisi",
});

/** Right next to Hotel A, popular — but has NO partnership with either hotel, so it must never be recommended. */
export const CORNER_CAFE = fixturePlace({
  id: DEMO_IDS.placeCornerCafe,
  name: "Corner Café (nearby, not a partner)",
  description: "A popular café a few steps from Hotel A.",
  latitude: 41.6939,
  longitude: 44.8017,
  category: "restaurant",
  address: "Old Town, Tbilisi",
});

/** Rough visit lengths, used only by the prototype itinerary preview. */
export const DEMO_VISIT_MINUTES: Readonly<Record<string, number>> = {
  [WINE_CELLAR.id]: 60,
  [CABLE_CAR.id]: 120,
  [ROOFTOP_SPA.id]: 90,
  [CORNER_CAFE.id]: 45,
};

const CONFIRMED = new Date("2026-01-02T00:00:00Z");

function activePartnership(id: string, hotel: DemoHotel, place: Place, priority: number | null = null): PartnershipRow {
  return {
    id,
    hotelId: hotel.id,
    placeId: place.id,
    status: "active",
    startsAt: null,
    endsAt: null,
    confirmedAt: CONFIRMED,
    priority,
    place,
  };
}

export const DEMO_DATA: DemoData = {
  hotels: [DEMO_HOTEL_A, DEMO_HOTEL_B],
  // Each hotel needs its OWN explicit row. The corner café has none.
  partnerships: [
    activePartnership(DEMO_IDS.partnershipAWine, DEMO_HOTEL_A, WINE_CELLAR, 1),
    activePartnership(DEMO_IDS.partnershipACableCar, DEMO_HOTEL_A, CABLE_CAR, 2),
    activePartnership(DEMO_IDS.partnershipBCableCar, DEMO_HOTEL_B, CABLE_CAR, 1),
  ],
  facilities: [
    {
      id: DEMO_IDS.facilityARooftopSpa,
      hotelId: DEMO_HOTEL_A.id,
      placeId: ROOFTOP_SPA.id,
      status: "active",
      facilityType: "spa",
      place: ROOFTOP_SPA,
    },
  ],
};
