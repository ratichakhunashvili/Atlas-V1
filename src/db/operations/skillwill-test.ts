import { and, eq, isNull } from "drizzle-orm";
import { atlasPartnerContracts, hotels, places, qrCredentials, type NewPlace } from "@/db/schema";
import { generateRawQrToken, hashQrToken } from "@/services/qr/token";
import type { AtlasDatabase } from "./types";

/**
 * SKILLWILL TEST BASE — Skillwill's Tbilisi office (16 Bochorma Street, Isani) as a test hotel, with REAL places
 * within a short walk, for the owner's field test (requested 2026-11-15). Coordinates: the office from Mapbox and
 * OpenStreetMap (rooftop, both agree); every place from OpenStreetMap (checked 2026-11-15). Cafés are mapped to the
 * "restaurant" category, as Atlas has no café category.
 *
 * The catalogue rule (docs/catalogue-model-plan.md) is unchanged:
 *   - Skillwill is the base: a hotel place plus a hotel record.
 *   - Attractions (museums, landmarks, a park) need no contract: published and verified, so visible at once.
 *   - Businesses (cafés, restaurants) get a PENDING Atlas contract only. They stay hidden until an admin confirms it
 *     in /admin/contracts (owner decision 2026-11-15: "I'll confirm in admin"). No contract or partnership is invented.
 *
 * QR codes: one hotel-entry code for Skillwill and one check-in code for every place, issued only where none is live
 * yet. Raw codes exist only in this function's return value (for the printable sheet); the database keeps hashes.
 *
 * Idempotent: fixed ids, conflicts ignored, so a re-run never duplicates or overwrites an admin's later edits.
 */

const ID = (n: number) => `5c111000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const SKILLWILL_TEST_IDS = { place: ID(1), hotel: ID(2) } as const;

export const SKILLWILL_BASE = {
  name: "Skillwill",
  description: "Skillwill's Tbilisi office: the base for testing Atlas.",
  address: "16 Bochorma Street, Tbilisi",
  latitude: 41.686473,
  longitude: 44.830894,
} as const;

type TestPlace = {
  n: number;
  name: string;
  category: NewPlace["category"];
  kind: "attraction" | "business";
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  visitDurationMinutes: number;
};

export const SKILLWILL_TEST_PLACES: readonly TestPlace[] = [
  // Attractions: visible without a contract.
  { n: 101, name: "Tbilisi Wedding Palace", category: "landmark", kind: "attraction", description: "The striking 1980s Ceremony Palace above the Mtkvari, a landmark of Soviet-era architecture.", address: "Isani, Tbilisi", latitude: 41.685015, longitude: 44.827831, visitDurationMinutes: 20 },
  { n: 102, name: "Avlabari Underground Printing House Museum", category: "museum", kind: "attraction", description: "A secret printing house hidden beneath a house in Avlabari, now a small museum.", address: "Avlabari, Tbilisi", latitude: 41.690779, longitude: 44.830064, visitDurationMinutes: 30 },
  { n: 103, name: "Church of St Andrew the First-Called", category: "historical", kind: "attraction", description: "Church in the Avlabari neighbourhood.", address: "Avlabari, Tbilisi", latitude: 41.690749, longitude: 44.828364, visitDurationMinutes: 15 },
  { n: 104, name: "Statue of Petre Bagrationi", category: "landmark", kind: "attraction", description: "Monument to the general Pyotr Bagration near the Metekhi bridge area.", address: "Isani, Tbilisi", latitude: 41.683284, longitude: 44.82341, visitDurationMinutes: 10 },
  { n: 105, name: "Jani Kalandadze Park", category: "nature", kind: "attraction", description: "A small green park for a break on the walk.", address: "Isani, Tbilisi", latitude: 41.681996, longitude: 44.824193, visitDurationMinutes: 20 },
  { n: 106, name: "Mimino Monument", category: "landmark", kind: "attraction", description: "Sculpture of the three heroes of the beloved film Mimino.", address: "Old Tbilisi", latitude: 41.69186, longitude: 44.815633, visitDurationMinutes: 10 },
  { n: 107, name: "Mirza Fatali Akhundov Museum", category: "museum", kind: "attraction", description: "Museum of Azerbaijani culture in the former house of the writer Mirza Fatali Akhundov.", address: "Old Tbilisi", latitude: 41.68842, longitude: 44.816098, visitDurationMinutes: 30 },
  { n: 108, name: "Abanotubani Sulphur Baths", category: "historical", kind: "attraction", description: "Tbilisi's historic bath quarter with its brick domes.", address: "Abanotubani, Old Tbilisi", latitude: 41.687627, longitude: 44.811252, visitDurationMinutes: 30 },

  // Businesses: a PENDING Atlas contract only, hidden until an admin confirms it.
  { n: 201, name: "Coffee & Flowers", category: "restaurant", kind: "business", description: "Café with coffee and flowers, a short walk from Skillwill.", address: "Isani, Tbilisi", latitude: 41.686939, longitude: 44.833467, visitDurationMinutes: 25 },
  { n: 202, name: "UZU House", category: "restaurant", kind: "business", description: "Neighbourhood café.", address: "Isani, Tbilisi", latitude: 41.686335, longitude: 44.834345, visitDurationMinutes: 25 },
  { n: 203, name: "Sapore", category: "restaurant", kind: "business", description: "Café near the Wedding Palace.", address: "Isani, Tbilisi", latitude: 41.686209, longitude: 44.826065, visitDurationMinutes: 25 },
  { n: 204, name: "Bangkok", category: "restaurant", kind: "business", description: "Thai restaurant next to Skillwill.", address: "Isani, Tbilisi", latitude: 41.685464, longitude: 44.832094, visitDurationMinutes: 45 },
  { n: 205, name: "Saffron Mess", category: "restaurant", kind: "business", description: "Restaurant in Avlabari.", address: "Avlabari, Tbilisi", latitude: 41.690573, longitude: 44.8288, visitDurationMinutes: 45 },
  { n: 206, name: "Megastar", category: "restaurant", kind: "business", description: "Café in Avlabari.", address: "Avlabari, Tbilisi", latitude: 41.691296, longitude: 44.831572, visitDurationMinutes: 25 },
];

export const skillwillPlaceId = (place: Pick<TestPlace, "n">) => ID(place.n);

/** A code issued just now. `kind` says which link the QR image must hold: /checkin/ (hotel) or /unlock/ (place). */
export type IssuedTestCode = { label: string; kind: "hotel" | "place"; rawToken: string };

export type SeedSkillwillResult = { hotel: boolean; places: number; contracts: number; codes: IssuedTestCode[] };

export async function seedSkillwillTest(db: AtlasDatabase, now: Date = new Date()): Promise<SeedSkillwillResult> {
  return db.transaction(async (tx) => {
    const verified = { publicationStatus: "published", publishedAt: now, verificationStatus: "verified", verifiedAt: now, kindConfirmedAt: now } as const;

    await tx
      .insert(places)
      .values({ id: SKILLWILL_TEST_IDS.place, ...SKILLWILL_BASE, category: "hotel", kind: "hotel", ...verified })
      .onConflictDoNothing();
    const hotel = await tx
      .insert(hotels)
      .values({ id: SKILLWILL_TEST_IDS.hotel, placeId: SKILLWILL_TEST_IDS.place })
      .onConflictDoNothing()
      .returning({ id: hotels.id });

    const inserted = await tx
      .insert(places)
      .values(
        SKILLWILL_TEST_PLACES.map(
          (place): NewPlace => ({
            id: skillwillPlaceId(place),
            name: place.name,
            description: place.description,
            address: place.address,
            latitude: place.latitude,
            longitude: place.longitude,
            category: place.category,
            kind: place.kind,
            visitDurationMinutes: place.visitDurationMinutes,
            ...verified,
          })
        )
      )
      .onConflictDoNothing()
      .returning({ id: places.id });

    const insertedIds = new Set(inserted.map((row) => row.id));
    const businesses = SKILLWILL_TEST_PLACES.filter((place) => place.kind === "business" && insertedIds.has(skillwillPlaceId(place)));
    const contracts = businesses.length
      ? await tx
          .insert(atlasPartnerContracts)
          .values(businesses.map((place) => ({ placeId: skillwillPlaceId(place), status: "pending_review" as const })))
          .onConflictDoNothing()
          .returning({ id: atlasPartnerContracts.id })
      : [];

    // QR codes, only where no live one exists (never rotates a code an admin may already have printed).
    const live = (subject: ReturnType<typeof eq>) =>
      tx
        .select({ id: qrCredentials.id })
        .from(qrCredentials)
        .where(and(subject, isNull(qrCredentials.revokedAt)))
        .limit(1);
    const codes: IssuedTestCode[] = [];
    if ((await live(eq(qrCredentials.hotelId, SKILLWILL_TEST_IDS.hotel))).length === 0) {
      const rawToken = generateRawQrToken();
      await tx.insert(qrCredentials).values({ purpose: "hotel_entry", hotelId: SKILLWILL_TEST_IDS.hotel, tokenHash: hashQrToken(rawToken), expiresAt: null });
      codes.push({ label: `${SKILLWILL_BASE.name} (hotel entry)`, kind: "hotel", rawToken });
    }
    for (const place of SKILLWILL_TEST_PLACES) {
      const placeId = skillwillPlaceId(place);
      if ((await live(eq(qrCredentials.placeId, placeId))).length > 0) continue;
      const rawToken = generateRawQrToken();
      await tx.insert(qrCredentials).values({ purpose: "place_check_in", placeId, tokenHash: hashQrToken(rawToken), expiresAt: null });
      codes.push({ label: place.name, kind: "place", rawToken });
    }

    return { hotel: hotel.length === 1, places: inserted.length, contracts: contracts.length, codes };
  });
}
