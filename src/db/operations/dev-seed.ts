import { and, eq, isNull } from "drizzle-orm";
import {
  hotelFacilities,
  hotelPartnerships,
  hotelStays,
  hotels,
  places,
  userPreferences,
  users,
  type NewPlace,
} from "@/db/schema";
import { createHotelStay } from "./hotel-stays";
import type { AtlasDatabase } from "./types";

/**
 * LOCAL DEVELOPMENT FIXTURES — never production data.
 *
 * Everything here is obviously fictional (names are prefixed, emails end in
 * `.test`) so a seeded row can never be mistaken for a real Place or a real
 * partner business. The coordinates are in Tbilisi only so the map and the
 * walking estimates have something plausible to work with; no real business
 * is named, described, or represented as an Atlas partner.
 *
 * The fixture set is deliberately shaped around the hotel-specific
 * eligibility rule, so it can be exercised by hand in a browser:
 *
 *   - Hotel A owns a facility                  -> eligible for A's guests, no partnership needed
 *   - Partner Cafe is active with Hotel A only -> eligible for A, NOT for B
 *   - Walking Tour is active with A and B      -> two separate rows, one per hotel
 *   - Unaffiliated Gallery has no relationship -> eligible for nobody, though published and verified
 *   - Wine Bar's partnership is suspended      -> eligible for nobody
 *
 * Idempotent: every insert is keyed on a stable fixture id and conflicts are
 * ignored, so re-running changes nothing and — importantly — can never
 * overwrite the password of a real account that happens to share an email.
 */

/**
 * Is this connection string pointing at a database on THIS machine?
 *
 * The real risk is not NODE_ENV: tsx runs with it unset, so a production check
 * alone would happily seed a shared or hosted database that a deployment also
 * reads — writing an admin account whose password is published in the README.
 * Only the host answers the question that matters.
 *
 * Anything unparseable is treated as NOT local. A guard that fails open is not
 * a guard.
 */
export function isLocalDatabaseUrl(connectionString: string): boolean {
  let host: string;
  try {
    host = new URL(connectionString).hostname.toLowerCase();
  } catch {
    return false;
  }
  // URL.hostname keeps the brackets around an IPv6 literal.
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1") return true;
  return host.endsWith(".localhost");
}

/** Stable so re-running the seed updates nothing and creates no duplicates. */
export const DEV_FIXTURE_IDS = {
  adminUser: "a71a5000-0000-4000-8000-000000000001",
  guestUser: "a71a5000-0000-4000-8000-000000000002",

  hotelAPlace: "a71a5000-0000-4000-8000-000000001001",
  hotelBPlace: "a71a5000-0000-4000-8000-000000001002",
  saunaPlace: "a71a5000-0000-4000-8000-000000001003",
  cafePlace: "a71a5000-0000-4000-8000-000000001004",
  tourPlace: "a71a5000-0000-4000-8000-000000001005",
  galleryPlace: "a71a5000-0000-4000-8000-000000001006",
  wineBarPlace: "a71a5000-0000-4000-8000-000000001007",

  hotelA: "a71a5000-0000-4000-8000-000000002001",
  hotelB: "a71a5000-0000-4000-8000-000000002002",

  saunaFacility: "a71a5000-0000-4000-8000-000000003001",

  cafePartnershipA: "a71a5000-0000-4000-8000-000000004001",
  tourPartnershipA: "a71a5000-0000-4000-8000-000000004002",
  tourPartnershipB: "a71a5000-0000-4000-8000-000000004003",
  wineBarPartnershipA: "a71a5000-0000-4000-8000-000000004004",
} as const;

export const DEV_FIXTURE_EMAILS = {
  admin: "admin@atlas.test",
  guest: "guest@atlas.test",
} as const;

/*
 * How many Places the fixtures define. A constant rather than a COUNT(*): this
 * module must not read the places table, because a direct Place read is exactly
 * what services/eligibility/guest-paths.test.ts forbids outside the query modules
 * that own it. Seeding writes Places; it has no business reading them back.
 */
export const FIXTURE_PLACE_COUNT = 7;

export type SeedDevFixturesInput = {
  /** Hashed by the caller. This module never imports bcrypt, so it stays importable by a plain `node --test` run. */
  adminPasswordHash: string;
  guestPasswordHash: string;
  now?: Date;
};

export type SeedDevFixturesResult = {
  adminEmail: string;
  guestEmail: string;
  /** Null when a non-fixture active stay already exists for the guest — the one-active-stay rule wins. */
  guestStayHotelPlaceId: string | null;
  fixturePlaceCount: number;
};

/**
 * A Place that is fit to recommend: published AND verified, each with the
 * timestamp its CHECK constraint requires. Leaving either timestamp out makes
 * the INSERT fail; leaving either status at its default makes the Place
 * invisible to every guest, which is far harder to notice.
 */
function recommendablePlace(input: Omit<NewPlace, "publicationStatus" | "publishedAt" | "verificationStatus" | "verifiedAt">, now: Date): NewPlace {
  return {
    ...input,
    publicationStatus: "published",
    publishedAt: now,
    verificationStatus: "verified",
    verifiedAt: now,
  };
}

export async function seedDevFixtures(
  db: AtlasDatabase,
  input: SeedDevFixturesInput
): Promise<SeedDevFixturesResult> {
  const now = input.now ?? new Date();
  const id = DEV_FIXTURE_IDS;

  await db
    .insert(users)
    .values([
      { id: id.adminUser, email: DEV_FIXTURE_EMAILS.admin, passwordHash: input.adminPasswordHash, role: "admin" },
      { id: id.guestUser, email: DEV_FIXTURE_EMAILS.guest, passwordHash: input.guestPasswordHash, role: "user" },
    ])
    .onConflictDoNothing();

  await db
    .insert(places)
    .values([
      recommendablePlace(
        {
          id: id.hotelAPlace,
          name: "Atlas Test Hotel A",
          description: "Fictional hotel used for local development.",
          latitude: 41.6934,
          longitude: 44.8015,
          category: "hotel",
          address: "1 Test Street, Tbilisi",
        },
        now
      ),
      recommendablePlace(
        {
          id: id.hotelBPlace,
          name: "Atlas Test Hotel B",
          description: "A second fictional hotel, so cross-hotel eligibility can be checked.",
          latitude: 41.699,
          longitude: 44.808,
          category: "hotel",
          address: "2 Test Street, Tbilisi",
        },
        now
      ),
      recommendablePlace(
        {
          id: id.saunaPlace,
          name: "[Test] Riverside Sauna",
          description: "Hotel A's own facility. Eligible for A's guests with no partnership.",
          latitude: 41.694,
          longitude: 44.802,
          category: "spa",
          address: "1 Test Street, Tbilisi",
          visitDurationMinutes: 60,
        },
        now
      ),
      recommendablePlace(
        {
          id: id.cafePlace,
          name: "[Test] Partner Cafe",
          description: "An external partner of Hotel A only.",
          latitude: 41.6928,
          longitude: 44.8032,
          category: "restaurant",
          address: "7 Test Street, Tbilisi",
          visitDurationMinutes: 45,
        },
        now
      ),
      recommendablePlace(
        {
          id: id.tourPlace,
          name: "[Test] Old Town Walking Tour",
          description: "An external partner of BOTH test hotels, through two separate partnership rows.",
          latitude: 41.6951,
          longitude: 44.8003,
          category: "tour",
          address: "12 Test Street, Tbilisi",
          visitDurationMinutes: 90,
        },
        now
      ),
      recommendablePlace(
        {
          id: id.galleryPlace,
          name: "[Test] Unaffiliated Gallery",
          description: "Published and verified, but partnered with no hotel. Must never be recommended to anyone.",
          latitude: 41.6922,
          longitude: 44.801,
          category: "museum",
          address: "19 Test Street, Tbilisi",
          visitDurationMinutes: 45,
        },
        now
      ),
      recommendablePlace(
        {
          id: id.wineBarPlace,
          name: "[Test] Suspended Wine Bar",
          description: "Its partnership with Hotel A is suspended, so it must never be recommended.",
          latitude: 41.6945,
          longitude: 44.8041,
          category: "nightlife",
          address: "23 Test Street, Tbilisi",
          visitDurationMinutes: 60,
        },
        now
      ),
    ])
    .onConflictDoNothing();

  await db
    .insert(hotels)
    .values([
      { id: id.hotelA, placeId: id.hotelAPlace },
      { id: id.hotelB, placeId: id.hotelBPlace },
    ])
    .onConflictDoNothing();

  // Hotel-OWNED. No partnership row exists for this Place, and that is the point:
  // a facility is eligible for its own hotel's guests and for nobody else's.
  await db
    .insert(hotelFacilities)
    .values([
      {
        id: id.saunaFacility,
        hotelId: id.hotelA,
        placeId: id.saunaPlace,
        facilityType: "spa",
        status: "active",
      },
    ])
    .onConflictDoNothing();

  // `active` requires confirmedAt — a DB CHECK, not a convention. The suspended row
  // carries a confirmation too, so the only thing making it ineligible is its status.
  await db
    .insert(hotelPartnerships)
    .values([
      {
        id: id.cafePartnershipA,
        hotelId: id.hotelA,
        placeId: id.cafePlace,
        status: "active",
        confirmedBy: id.adminUser,
        confirmedAt: now,
        priority: 1,
      },
      {
        id: id.tourPartnershipA,
        hotelId: id.hotelA,
        placeId: id.tourPlace,
        status: "active",
        confirmedBy: id.adminUser,
        confirmedAt: now,
        priority: 2,
      },
      {
        id: id.tourPartnershipB,
        hotelId: id.hotelB,
        placeId: id.tourPlace,
        status: "active",
        confirmedBy: id.adminUser,
        confirmedAt: now,
        priority: 1,
      },
      {
        id: id.wineBarPartnershipA,
        hotelId: id.hotelA,
        placeId: id.wineBarPlace,
        status: "suspended",
        confirmedBy: id.adminUser,
        confirmedAt: now,
      },
    ])
    .onConflictDoNothing();

  // Interests that match the seeded partners, so the home page reaches its "ready"
  // state instead of asking the guest to choose interests first.
  await db
    .insert(userPreferences)
    .values({
      userId: id.guestUser,
      // nightlife is included so the suspended wine bar is a real negative control: if a
      // suspended partnership ever leaked, a preference filter must not be what hides it.
      categories: ["restaurant", "tour", "spa", "museum", "nightlife"],
      budget: "moderate",
      activityLevel: "moderate",
    })
    .onConflictDoNothing();

  /*
   * An active stay at Hotel A, so the guest flow works without scanning anything.
   * No QR credential is seeded on purpose: issuing one means printing a raw token,
   * and raw tokens are shown exactly once, in the admin UI, never in a log.
   *
   * createHotelStay is the real operation, so the one-active-stay index decides the
   * outcome here exactly as it does in production: it returns null rather than
   * throwing if this guest already has an open stay, which is what makes re-running
   * the seed safe.
   */
  const [existingStay] = await db
    .select()
    .from(hotelStays)
    .where(and(eq(hotelStays.userId, id.guestUser), isNull(hotelStays.checkOut)))
    .limit(1);

  const stay =
    existingStay ??
    (await createHotelStay(db, {
      userId: id.guestUser,
      hotelId: id.hotelA,
      checkIn: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    }));

  return {
    adminEmail: DEV_FIXTURE_EMAILS.admin,
    guestEmail: DEV_FIXTURE_EMAILS.guest,
    guestStayHotelPlaceId: stay && stay.hotelId === id.hotelA ? id.hotelAPlace : null,
    fixturePlaceCount: FIXTURE_PLACE_COUNT,
  };
}
