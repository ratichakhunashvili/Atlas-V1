import "server-only";
import { and, eq, gte, ilike, lte } from "drizzle-orm";
import { db } from "@/db";
import { places, type Place, type PlaceCategory } from "@/db/schema";
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
  // Not exposed on the admin Place form yet (reserved for future QR
  // provisioning UI) — the Advisor test-scenario tool is the first caller
  // that needs to set this at creation time.
  qrToken?: string | null;
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
};

const MAP_POINT_COLUMNS = {
  id: places.id,
  name: places.name,
  description: places.description,
  category: places.category,
  latitude: places.latitude,
  longitude: places.longitude,
  address: places.address,
} as const;

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
export async function listPlacesNear(center: LatLng, radiusMeters: number): Promise<PlaceMapPoint[]> {
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
 * Same radius query as listPlacesNear, but full Place rows (imageUrl
 * included) — for server-side consumers like the Advisor's candidate
 * retrieval that need more than the map's lean PlaceMapPoint. Never sent to
 * the client as-is.
 */
export async function listFullPlacesNear(center: LatLng, radiusMeters: number): Promise<Place[]> {
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
export async function searchPlacesByName(query: string, limit = 20): Promise<PlaceMapPoint[]> {
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

/** Resolves a scanned QR token to its canonical Place — exact match only, same pattern as findHotelByQrToken (db/queries/hotels.ts) but for Place/partner QR check-in, a separate concern from hotel onboarding. */
export async function findPlaceByQrToken(qrToken: string): Promise<Place | null> {
  const [place] = await db.select().from(places).where(eq(places.qrToken, qrToken)).limit(1);
  return place ?? null;
}

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
  const [place] = await db.insert(places).values(input).returning();
  return place;
}

export async function updatePlace(id: string, input: Partial<PlaceInput>) {
  const [place] = await db
    .update(places)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(places.id, id))
    .returning();
  return place ?? null;
}

export async function deletePlace(id: string) {
  await db.delete(places).where(eq(places.id, id));
}
