import { eq } from "drizzle-orm";
import { placeModels, type ModelStatus, type PlaceModel } from "@/db/schema";
import type { AtlasDatabase } from "./types";

export type ModelPlacementInput = {
  status: ModelStatus;
  targetHeightMeters: number;
  rotationDegrees: number;
  pitchDegrees: number;
  rollDegrees: number;
  elevationOffsetMeters: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  /** Both null = drawn at the Place's own coordinates. */
  anchorLatitude: number | null;
  anchorLongitude: number | null;
};

/**
 * Saves how ONE model is drawn.
 *
 * It writes the `place_models` row and nothing else. It cannot reach a Place: no `places` column is named here, so
 * the canonical coordinates, publication, verification, partnerships, check-in coordinates and achievements are
 * untouched by construction — which is exactly what lets an admin move a model freely. The database CHECKs
 * (region, both-or-neither anchor, transform ranges) hold even if a caller skipped the pure validation.
 */
export async function saveModelPlacement(
  db: AtlasDatabase,
  id: string,
  input: ModelPlacementInput
): Promise<PlaceModel | null> {
  const [row] = await db
    .update(placeModels)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(placeModels.id, id))
    .returning();

  return row ?? null;
}
