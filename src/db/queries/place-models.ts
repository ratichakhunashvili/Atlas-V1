import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { placeModels, places, type PlaceModel } from "@/db/schema";
import { saveModelPlacement, type ModelPlacementInput } from "@/db/operations/place-model-settings";

/** One Place's model, if it has one. */
export async function findModelForPlace(placeId: string): Promise<PlaceModel | null> {
  const [row] = await db.select().from(placeModels).where(eq(placeModels.placeId, placeId)).limit(1);
  return row ?? null;
}

export async function findModelById(id: string): Promise<PlaceModel | null> {
  const [row] = await db.select().from(placeModels).where(eq(placeModels.id, id)).limit(1);
  return row ?? null;
}

/**
 * Models for a known set of Places, with the coordinates to anchor them.
 *
 * Takes the eligible ids as an argument rather than filtering afterwards: the
 * caller has already resolved what this guest may see, and a query that could
 * return more than that is a query somebody will later forget to filter.
 */
export async function listModelsForPlaces(placeIds: readonly string[]) {
  if (placeIds.length === 0) return [];

  return db
    .select({
      model: placeModels,
      place: { id: places.id, latitude: places.latitude, longitude: places.longitude },
    })
    .from(placeModels)
    .innerJoin(places, eq(placeModels.placeId, places.id))
    .where(inArray(placeModels.placeId, [...placeIds]));
}

/** Admin listing: every model with its Place's name. */
export async function listModelsForAdmin() {
  return db
    .select({
      model: placeModels,
      placeName: places.name,
      placeArchivedAt: places.archivedAt,
    })
    .from(placeModels)
    .innerJoin(places, eq(placeModels.placeId, places.id))
    .orderBy(places.name);
}

export type AdminModelRow = Awaited<ReturnType<typeof listModelsForAdmin>>[number];

export async function upsertPlaceModel(input: {
  placeId: string;
  storageKey: string;
  fileUrl: string;
  fileSizeBytes: number;
  contentType: string;
  uploadedByUserId: string;
}): Promise<PlaceModel> {
  const [row] = await db
    .insert(placeModels)
    .values(input)
    .onConflictDoUpdate({
      target: placeModels.placeId,
      // Replacing the file keeps the Place's existing placement settings: an admin
      // who re-exports a model should not have to re-enter its height and rotation.
      set: {
        storageKey: input.storageKey,
        fileUrl: input.fileUrl,
        fileSizeBytes: input.fileSizeBytes,
        contentType: input.contentType,
        uploadedByUserId: input.uploadedByUserId,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}

/** Saves how a model is drawn. The operation writes the place_models row only — see db/operations/place-model-settings.ts. */
export async function updateModelSettings(id: string, input: ModelPlacementInput): Promise<PlaceModel | null> {
  return saveModelPlacement(db, id, input);
}

export async function deletePlaceModel(id: string): Promise<PlaceModel | null> {
  const [row] = await db.delete(placeModels).where(eq(placeModels.id, id)).returning();
  return row ?? null;
}
