import "server-only";
import { and, eq, gte, ilike, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { hotelFacilities, hotelPartnerships, places, type Place, type PlaceCategory, type PublicationStatus, type VerificationStatus } from "@/db/schema";
import type { DuplicateCandidate } from "@/services/catalog/duplicates";
import { boundingBoxForRadius, distanceMeters, type LatLng } from "@/lib/geo";

export type PlaceInput = {
  name: string;
  description?: string | null;
  latitude: number;
  longitude: number;
  category: PlaceCategory;
  address?: string | null;
  imageUrl?: string | null;
  website?: string | null;
  phone?: string | null;
  /** Minutes; null = not configured (the Advisor then uses its labelled category estimate). */
  visitDurationMinutes?: number | null;
  /** 1 budget, 2 moderate, 3 luxury; null = unknown. */
  priceLevel?: number | null;
  /** Evidence for the price level: where it came from and when an admin last confirmed it. Both null when there is no level. */
  priceLevelSource?: string | null;
  priceLevelVerifiedAt?: Date | null;
  // Not exposed on the admin Place form yet (reserved for future QR
  // provisioning UI) — the Advisor test-scenario tool is the first caller
  // that needs to set this at creation time.
  qrToken?: string | null;
  /** Defaults to draft / unverified: a Place is never recommendable until an admin publishes AND verifies it. */
  publicationStatus?: PublicationStatus;
  verificationStatus?: VerificationStatus;
};

/** The lean shape sent to the client map — never the full row (createdAt/updatedAt/imageUrl/website/phone stay server-side until a feature needs them). */
export type PlaceMapPoint = {
  id: string;
  name: string;
  description: string | null;
  category: PlaceCategory;
  latitude: number;
  longitude: number;
  address: string | null;
  /** 1 budget, 2 moderate, 3 luxury; null = unknown (never shown as affordable). */
  priceLevel: number | null;
};

const MAP_POINT_COLUMNS = {
  id: places.id,
  name: places.name,
  description: places.description,
  category: places.category,
  latitude: places.latitude,
  longitude: places.longitude,
  address: places.address,
  priceLevel: places.priceLevel,
} as const;

/**
 * ADMIN / MANAGEMENT ONLY: the queries named admin* below return Places with
 * NO hotel-eligibility filtering. Guest-facing code must never import them —
 * it goes through services/eligibility instead (enforced by
 * src/services/eligibility/guest-paths.test.ts).
 */
export async function listPlaces() {
  return db.select().from(places).orderBy(places.name);
}

/**
 * Narrows `rows` to those truly within `radiusMeters` of `center` (exact
 * Haversine, lib/geo.ts), nearest first. Shared by every "nearby places"
 * query below so there's one distance-filter-and-sort implementation
 * regardless of which columns the caller selected.
 */
function filterAndSortByRadius<T extends { latitude: number; longitude: number }>(
  rows: T[],
  center: LatLng,
  radiusMeters: number
): T[] {
  return rows
    .map((row) => ({ row, distance: distanceMeters(center, { lat: row.latitude, lng: row.longitude }) }))
    .filter(({ distance }) => distance <= radiusMeters)
    .sort((a, b) => a.distance - b.distance)
    .map(({ row }) => row);
}

/**
 * Places within `radiusMeters` of `center`, nearest first. No PostGIS yet:
 * a bounding-box pre-filter (index-backed via places_coordinates_idx) narrows
 * the candidate set cheaply, then an exact Haversine pass trims it to a true
 * circle and sorts it. Fine at hundreds-to-low-thousands of rows; revisit
 * with PostGIS/earthdistance if Place count grows much past that.
 */
export async function adminListPlacesNear(center: LatLng, radiusMeters: number): Promise<PlaceMapPoint[]> {
  const box = boundingBoxForRadius(center, radiusMeters);

  const rows = await db
    .select(MAP_POINT_COLUMNS)
    .from(places)
    .where(
      and(
        gte(places.latitude, box.minLat),
        lte(places.latitude, box.maxLat),
        gte(places.longitude, box.minLng),
        lte(places.longitude, box.maxLng)
      )
    );

  return filterAndSortByRadius(rows, center, radiusMeters);
}

/**
 * Same radius query as adminListPlacesNear, but full Place rows (imageUrl
 * included) — for server-side consumers like the Advisor's candidate
 * retrieval that need more than the map's lean PlaceMapPoint. Never sent to
 * the client as-is.
 */
export async function adminListFullPlacesNear(center: LatLng, radiusMeters: number): Promise<Place[]> {
  const box = boundingBoxForRadius(center, radiusMeters);

  const rows = await db
    .select()
    .from(places)
    .where(
      and(
        gte(places.latitude, box.minLat),
        lte(places.latitude, box.maxLat),
        gte(places.longitude, box.minLng),
        lte(places.longitude, box.maxLng)
      )
    );

  return filterAndSortByRadius(rows, center, radiusMeters);
}

/** Search boundary for Place name lookup. No UI/route consumes this yet (Phase 3+); it exists so future search has one Place-backed implementation to call rather than a second POI source. */
export async function adminSearchPlacesByName(query: string, limit = 20): Promise<PlaceMapPoint[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return db
    .select(MAP_POINT_COLUMNS)
    .from(places)
    .where(ilike(places.name, `%${trimmed}%`))
    .orderBy(places.name)
    .limit(limit);
}

export async function findPlaceById(id: string) {
  const [place] = await db.select().from(places).where(eq(places.id, id)).limit(1);
  return place ?? null;
}

/*
 * findPlaceByQrToken is deliberately gone: a scan is no longer resolved by
 * comparing a raw column value. Place check-in resolves a hashed, purpose-bound
 * credential (services/qr + db/queries/qr-credentials) and then loads the Place
 * by the id stored on that credential, so a hotel-entry code can never resolve here.
 */

/**
 * Exact prefix match (never substring — callers pass a marker that must not
 * accidentally widen into an unrelated Place). `%`/`_` in `prefix` are
 * escaped so a scenario tag containing either can never broaden an ILIKE
 * pattern into matching unrelated rows. Used by the Advisor test-scenario
 * tool to find every Place it created for one scenario, for both display
 * and safe cleanup — never by any guest-facing feature.
 */
export async function listPlacesByNamePrefix(prefix: string): Promise<Place[]> {
  const escaped = prefix.replace(/[\\%_]/g, (char) => `\\${char}`);
  return db.select().from(places).where(ilike(places.name, `${escaped}%`));
}

export async function createPlace(input: PlaceInput) {
  const now = new Date();
  const publicationStatus = input.publicationStatus ?? "draft";
  const verificationStatus = input.verificationStatus ?? "unverified";
  const [place] = await db
    .insert(places)
    .values({
      ...input,
      publicationStatus,
      publishedAt: publicationStatus === "published" ? now : null,
      verificationStatus,
      verifiedAt: verificationStatus === "verified" ? now : null,
    })
    .returning();
  return place;
}

export async function updatePlace(id: string, input: Partial<PlaceInput>) {
  const { publicationStatus, verificationStatus, ...rest } = input;
  // The status timestamp is kept when the status doesn't change and set/cleared when it does, in one UPDATE
  // (no read-then-write race). The CHECK constraints guarantee status and timestamp always agree.
  const statusColumns = {
    ...(publicationStatus !== undefined && {
      publicationStatus,
      publishedAt:
        publicationStatus === "published" ? sql`coalesce(${places.publishedAt}, now())` : sql`null`,
    }),
    ...(verificationStatus !== undefined && {
      verificationStatus,
      verifiedAt:
        verificationStatus === "verified" ? sql`coalesce(${places.verifiedAt}, now())` : sql`null`,
    }),
  };
  const [place] = await db
    .update(places)
    .set({ ...rest, ...statusColumns, updatedAt: new Date() })
    .where(eq(places.id, id))
    .returning();
  return place ?? null;
}

export async function deletePlace(id: string) {
  await db.delete(places).where(eq(places.id, id));
}

/** Soft-archive (preferred over deleting): the Place is never eligible again, but partnership/itinerary history stays intact. Archiving also UNPUBLISHES it (a DB check requires that); unarchiving leaves it a draft that must be deliberately republished. */
export async function setPlaceArchived(id: string, archived: boolean) {
  const [place] = await db
    .update(places)
    .set(
      archived
        ? { archivedAt: new Date(), publicationStatus: "draft", publishedAt: null, updatedAt: new Date() }
        : { archivedAt: null, updatedAt: new Date() }
    )
    .where(eq(places.id, id))
    .returning();
  return place ?? null;
}

/**
 * The experiences catalog: every Place that is not a hotel, with how many hotels
 * have approved it and how many own it as a facility.
 *
 * A VIEW over the canonical Place model. "Attraction" is not a separate entity —
 * it is a Place that guests might visit, so this is the Places table filtered and
 * annotated, never a second table that could drift from it.
 *
 * The counts say whether a Place can reach any guest at all: a published, verified
 * Place with no relationship to any hotel is invisible to everyone, which is easy
 * to create by accident and impossible to see from the Place alone.
 */
export async function listExperiencePlacesForAdmin() {
  const partnershipCount = db
    .select({
      placeId: hotelPartnerships.placeId,
      total: sql<number>`count(*)::int`.as("partnership_total"),
    })
    .from(hotelPartnerships)
    .groupBy(hotelPartnerships.placeId)
    .as("partnership_counts");

  const facilityCount = db
    .select({
      placeId: hotelFacilities.placeId,
      total: sql<number>`count(*)::int`.as("facility_total"),
    })
    .from(hotelFacilities)
    .groupBy(hotelFacilities.placeId)
    .as("facility_counts");

  return db
    .select({
      place: places,
      partnerships: sql<number>`coalesce(${partnershipCount.total}, 0)`,
      facilities: sql<number>`coalesce(${facilityCount.total}, 0)`,
    })
    .from(places)
    .leftJoin(partnershipCount, eq(partnershipCount.placeId, places.id))
    .leftJoin(facilityCount, eq(facilityCount.placeId, places.id))
    // Hotels are administered in their own section; this is the catalog of things to visit.
    .where(ne(places.category, "hotel"))
    .orderBy(places.name);
}

export type AdminExperiencePlace = Awaited<ReturnType<typeof listExperiencePlacesForAdmin>>[number];

/**
 * ADMIN ONLY: the pool a new Place is checked against for likely duplicates — everything within 300 m, plus any
 * Place sharing the candidate's first word (>= 3 letters). Archived Places are included on purpose: an admin may
 * prefer to restore one over creating a second record. Suggestion only; nothing here merges or blocks.
 */
export async function adminListDuplicateCandidates(candidate: {
  name: string;
  latitude: number;
  longitude: number;
}): Promise<DuplicateCandidate[]> {
  const box = boundingBoxForRadius({ lat: candidate.latitude, lng: candidate.longitude }, 300);
  const firstWord = candidate.name.trim().split(/\s+/)[0] ?? "";
  const escaped = firstWord.replace(/[\\%_]/g, (char) => `\\${char}`);

  const nearby = and(
    gte(places.latitude, box.minLat),
    lte(places.latitude, box.maxLat),
    gte(places.longitude, box.minLng),
    lte(places.longitude, box.maxLng)
  );
  const condition = firstWord.length >= 3 ? or(nearby, ilike(places.name, `%${escaped}%`)) : nearby;

  const rows = await db
    .select({
      id: places.id,
      name: places.name,
      latitude: places.latitude,
      longitude: places.longitude,
      category: places.category,
      archivedAt: places.archivedAt,
    })
    .from(places)
    .where(condition)
    .limit(200);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    category: row.category,
    archived: row.archivedAt !== null,
  }));
}
