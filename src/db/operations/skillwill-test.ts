import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { atlasPartnerContracts, hotelDayProgramSteps, hotelFacilities, hotels, places, qrCredentials, type NewPlace } from "@/db/schema";
import { generateRawQrToken, hashQrToken } from "@/services/qr/token";
import areaData from "@/db/data/skillwill-area.json";
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
 *   - Campus facilities (Kombinati, Gamezone, Auditorium 402, Auditorium 102, Fablab; owner decisions 2026-11-15) are Skillwill's OWN facilities: an
 *     active hotel_facilities row each, so only Skillwill guests ever see them. Their Places are kind "business" with
 *     NO contract, so they reach no other hotel's guests (and disappear entirely if the facility is switched off).
 *     Check-in is QR only. Written directly, like the contracts above, since a seed has no admin actor for the audit.
 *
 *   - Owner-approved activations (2026-11-15): the Atlas contracts of "Bangkok" and "Tema" are made ACTIVE (confirmed
 *     and starting at seed time, no end), only while they are still pending_review, so an admin's later decision stands.
 *   - Skillwill's day program (owner decision 2026-11-15): 1) Auditorium 402 / Auditorium 102 / Gamezone,
 *     2) Kombinati / Tema / Bangkok, 3) Fablab. Inserted only while Skillwill has no program, never over an admin's.
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
  // OpenStreetMap node/4388766699. Outside the campus, so the default check-in (QR or location).
  { n: 207, name: "Tema", category: "restaurant", kind: "business", description: "Restaurant next to Skillwill, on Bochorma Street.", address: "14 Bochorma Street, Tbilisi", latitude: 41.686092, longitude: 44.830502, visitDurationMinutes: 45 },
];

/** Businesses whose contracts the owner approved as active (2026-11-15). */
export const SKILLWILL_ACTIVE_CONTRACT_PLACES: readonly string[] = ["Bangkok", "Tema"];

export const skillwillPlaceId = (place: Pick<TestPlace, "n">) => ID(place.n);

/** Skillwill's own campus facilities: Places 301-305, facility rows 311-315. QR check-in only (everything in the campus is). */
export const SKILLWILL_TEST_FACILITIES = [
  {
    n: 301,
    facilityN: 311,
    name: "Kombinati",
    description: "Kombinati, a space on the Skillwill campus at 16 Bochorma Street.",
    visitDurationMinutes: 30,
  },
  {
    n: 302,
    facilityN: 312,
    // Was "PlayStation Room" (renamed 2026-11-15; same id and QR code). The seed renames it only while it has the old name.
    name: "Gamezone",
    description: "The PlayStation room on the Skillwill campus: a quick game or two between classes.",
    visitDurationMinutes: 30,
  },
  {
    n: 303,
    facilityN: 313,
    name: "Auditorium 402",
    description: "Auditorium 402 on the Skillwill campus at 16 Bochorma Street.",
    visitDurationMinutes: 30,
  },
  {
    n: 304,
    facilityN: 314,
    name: "Auditorium 102",
    description: "Auditorium 102 on the Skillwill campus at 16 Bochorma Street.",
    visitDurationMinutes: 30,
  },
  {
    n: 305,
    facilityN: 315,
    name: "Fablab",
    description: "Skillwill College's Fab Lab, on the campus at 16 Bochorma Street.",
    visitDurationMinutes: 30,
  },
] as const;

/** The facility's name before the 2026-11-15 rename, replaced by the seed only where it is still the name. */
export const SKILLWILL_GAMEZONE_OLD_NAME = "PlayStation Room";

/** Skillwill's day program, by place name (hand-picked places and campus facilities). */
export const SKILLWILL_DAY_PROGRAM: readonly (readonly string[])[] = [
  ["Auditorium 402", "Auditorium 102", "Gamezone"],
  ["Kombinati", "Tema", "Bangkok"],
  ["Fablab"],
];

export const skillwillFacilityId = (facility: { facilityN: number }) => ID(facility.facilityN);

/**
 * The wider area (owner request 2026-11-15: food, attractions and fun within 3 km, everything OpenStreetMap lists):
 * src/db/data/skillwill-area.json, built from OpenStreetMap on 2026-11-15 by atlas-qa-tools/build-skillwill-area.mjs.
 * Photos only where OpenStreetMap links a free-licensed Wikimedia Commons image, credited in the description. Same
 * catalogue rule: attractions visible at once, every business only after an admin confirms its pending contract.
 */
export type AreaPlace = {
  osm: string;
  name: string;
  category: NewPlace["category"];
  kind: "attraction" | "business";
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  website: string | null;
  phone: string | null;
  visitDurationMinutes: number;
  imageUrl: string | null;
};

export const SKILLWILL_AREA_PLACES = areaData as readonly AreaPlace[];

const OSM_TYPE_DIGIT: Record<string, string> = { node: "1", way: "2", relation: "3" };

/** A stable id from the OpenStreetMap element, so a re-run finds the same row: 5c111000-0000-4000-8001-<type><id hex>. */
export function areaPlaceId(place: Pick<AreaPlace, "osm">): string {
  const [type, id] = place.osm.split("/");
  return `5c111000-0000-4000-8001-${OSM_TYPE_DIGIT[type] ?? "9"}${BigInt(id).toString(16).padStart(11, "0")}`;
}

/** A code issued just now. `kind` says which link the QR image must hold: /checkin/ (hotel) or /unlock/ (place). */
export type IssuedTestCode = { label: string; kind: "hotel" | "place"; rawToken: string };

export type SeedSkillwillResult = {
  hotel: boolean;
  places: number;
  contracts: number;
  facilities: number;
  /** Pending contracts made active this run (Bangkok, Tema). */
  activatedContracts: number;
  /** Whether the day program was inserted this run. */
  program: boolean;
  codes: IssuedTestCode[];
};

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

    const area: NewPlace[] = SKILLWILL_AREA_PLACES.map((place) => ({
      id: areaPlaceId(place),
      name: place.name,
      description: place.description,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
      category: place.category,
      kind: place.kind,
      website: place.website,
      phone: place.phone,
      imageUrl: place.imageUrl,
      visitDurationMinutes: place.visitDurationMinutes,
      ...verified,
    }));
    for (let i = 0; i < area.length; i += 200) {
      inserted.push(...(await tx.insert(places).values(area.slice(i, i + 200)).onConflictDoNothing().returning({ id: places.id })));
    }

    // Every place this run, by id: name and kind, for contracts and QR labels.
    const all = [
      ...SKILLWILL_TEST_PLACES.map((place) => ({ id: skillwillPlaceId(place), name: place.name, kind: place.kind })),
      ...SKILLWILL_AREA_PLACES.map((place) => ({ id: areaPlaceId(place), name: place.name, kind: place.kind })),
    ];
    const insertedIds = new Set(inserted.map((row) => row.id));
    const businesses = all.filter((place) => place.kind === "business" && insertedIds.has(place.id));
    const contracts: { id: string }[] = [];
    for (let i = 0; i < businesses.length; i += 300) {
      contracts.push(
        ...(await tx
          .insert(atlasPartnerContracts)
          .values(businesses.slice(i, i + 300).map((place) => ({ placeId: place.id, status: "pending_review" as const })))
          .onConflictDoNothing()
          .returning({ id: atlasPartnerContracts.id }))
      );
    }

    // Campus facilities: the Place (business, no contract, QR only) and its active facility row for Skillwill.
    inserted.push(
      ...(await tx
        .insert(places)
        .values(
          SKILLWILL_TEST_FACILITIES.map(
            (facility): NewPlace => ({
              id: ID(facility.n),
              name: facility.name,
              description: facility.description,
              address: SKILLWILL_BASE.address,
              latitude: SKILLWILL_BASE.latitude,
              longitude: SKILLWILL_BASE.longitude,
              category: "activity",
              kind: "business",
              checkInMethod: "qr",
              visitDurationMinutes: facility.visitDurationMinutes,
              ...verified,
            })
          )
        )
        .onConflictDoNothing()
        .returning({ id: places.id }))
    );
    const facilities = await tx
      .insert(hotelFacilities)
      .values(
        SKILLWILL_TEST_FACILITIES.map((facility) => ({
          id: skillwillFacilityId(facility),
          hotelId: SKILLWILL_TEST_IDS.hotel,
          placeId: ID(facility.n),
          facilityType: "other" as const,
          status: "active" as const,
        }))
      )
      .onConflictDoNothing()
      .returning({ id: hotelFacilities.id });
    // The rename (keeps id and QR code), only where the old name is still there: an admin's own rename stands.
    const gamezone = SKILLWILL_TEST_FACILITIES.find((facility) => facility.n === 302)!;
    await tx
      .update(places)
      .set({ name: gamezone.name, updatedAt: now })
      .where(and(eq(places.id, ID(gamezone.n)), eq(places.name, SKILLWILL_GAMEZONE_OLD_NAME)));
    // Everything in the campus is QR only (owner decision 2026-11-15), also for facility places seeded earlier.
    await tx
      .update(places)
      .set({ checkInMethod: "qr", updatedAt: now })
      .where(and(inArray(places.id, SKILLWILL_TEST_FACILITIES.map((facility) => ID(facility.n))), ne(places.checkInMethod, "qr")));

    // Owner-approved activation: confirmed and starting now, no end; only contracts still pending_review, and never
    // where the Place already has an active one (one active contract per Place). No admin actor: confirmed_by stays null.
    const activeIds = SKILLWILL_TEST_PLACES.filter((place) => SKILLWILL_ACTIVE_CONTRACT_PLACES.includes(place.name)).map(skillwillPlaceId);
    const alreadyActive = new Set(
      (
        await tx
          .select({ placeId: atlasPartnerContracts.placeId })
          .from(atlasPartnerContracts)
          .where(and(inArray(atlasPartnerContracts.placeId, activeIds), eq(atlasPartnerContracts.status, "active")))
      ).map((row) => row.placeId)
    );
    const toActivate = activeIds.filter((id) => !alreadyActive.has(id));
    const activated =
      toActivate.length === 0
        ? []
        : await tx
            .update(atlasPartnerContracts)
            .set({ status: "active", confirmedAt: now, startsAt: now, endsAt: null, updatedAt: now })
            .where(and(inArray(atlasPartnerContracts.placeId, toActivate), eq(atlasPartnerContracts.status, "pending_review")))
            .returning({ id: atlasPartnerContracts.id });

    // The day program, only while Skillwill has none (never over an admin's).
    const nameToId = new Map<string, string>([
      ...SKILLWILL_TEST_PLACES.map((place) => [place.name, skillwillPlaceId(place)] as const),
      ...SKILLWILL_TEST_FACILITIES.map((facility) => [facility.name, ID(facility.n)] as const),
    ]);
    const existingProgram = await tx
      .select({ id: hotelDayProgramSteps.id })
      .from(hotelDayProgramSteps)
      .where(eq(hotelDayProgramSteps.hotelId, SKILLWILL_TEST_IDS.hotel))
      .limit(1);
    if (existingProgram.length === 0) {
      await tx.insert(hotelDayProgramSteps).values(
        SKILLWILL_DAY_PROGRAM.map((names, i) => ({
          hotelId: SKILLWILL_TEST_IDS.hotel,
          position: i + 1,
          placeIds: names.map((name) => nameToId.get(name)!),
          createdAt: now,
          updatedAt: now,
        }))
      );
    }

    // The facilities get QR codes like every other place (after the contract step: they never get a contract).
    all.push(...SKILLWILL_TEST_FACILITIES.map((facility) => ({ id: ID(facility.n), name: facility.name, kind: "business" as const })));

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
    // Places: one query for those that already have a live code, then one insert per batch for the rest.
    const withCode = new Set<string>();
    for (let i = 0; i < all.length; i += 500) {
      const ids = all.slice(i, i + 500).map((place) => place.id);
      const rows = await tx
        .select({ placeId: qrCredentials.placeId })
        .from(qrCredentials)
        .where(and(inArray(qrCredentials.placeId, ids), isNull(qrCredentials.revokedAt)));
      for (const row of rows) if (row.placeId) withCode.add(row.placeId);
    }
    const toIssue = all.filter((place) => !withCode.has(place.id)).map((place) => ({ place, rawToken: generateRawQrToken() }));
    for (let i = 0; i < toIssue.length; i += 300) {
      await tx.insert(qrCredentials).values(
        toIssue.slice(i, i + 300).map(({ place, rawToken }) => ({ purpose: "place_check_in" as const, placeId: place.id, tokenHash: hashQrToken(rawToken), expiresAt: null }))
      );
    }
    for (const { place, rawToken } of toIssue) codes.push({ label: place.name, kind: "place", rawToken });

    return {
      hotel: hotel.length === 1,
      places: inserted.length,
      contracts: contracts.length,
      facilities: facilities.length,
      activatedContracts: activated.length,
      program: existingProgram.length === 0,
      codes,
    };
  });
}
