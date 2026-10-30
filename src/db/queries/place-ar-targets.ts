import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { placeArTargets, places, type PlaceArTarget } from "@/db/schema";

/**
 * Reads for the AR reference hashes.
 *
 * **Only one function in this module returns a hash**, and its single caller is
 * the server-side comparison in services/advisor/check-in-ar.ts. Everything else
 * here deliberately selects columns that exclude `target_hash`, so a page, an
 * admin table or a payload cannot carry it to a browser by accident. A client
 * holding the target could submit a perfect match without ever opening a camera,
 * which would turn AR verification into a formality.
 *
 * No image is stored or read anywhere here — see the schema for why.
 */

/**
 * The reference hash to compare a capture against. Server-side only.
 *
 * The return value must be consumed by the comparison and never placed in a
 * result, a log line or a response.
 */
export async function findArTargetHash(placeId: string): Promise<string | null> {
  const [row] = await db
    .select({ targetHash: placeArTargets.targetHash })
    .from(placeArTargets)
    .where(eq(placeArTargets.placeId, placeId))
    .limit(1);

  return row?.targetHash ?? null;
}

/**
 * Whether a Place can be verified by camera at all, without disclosing anything
 * about the target itself. This is what guest-facing code is allowed to know.
 */
export async function placeHasArTarget(placeId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: placeArTargets.id })
    .from(placeArTargets)
    .where(eq(placeArTargets.placeId, placeId))
    .limit(1);

  return row !== undefined;
}

/** Which of these Places have a target. Used to decide where to offer the camera. */
export async function placeIdsWithArTargets(placeIds: readonly string[]): Promise<Set<string>> {
  if (placeIds.length === 0) return new Set();

  const rows = await db
    .select({ placeId: placeArTargets.placeId })
    .from(placeArTargets)
    .where(inArray(placeArTargets.placeId, [...placeIds]));

  return new Set(rows.map((row) => row.placeId));
}

/** Admin listing. Note the explicit column list: the hash is not among them. */
export async function listArTargetsForAdmin() {
  return db
    .select({
      id: placeArTargets.id,
      placeId: placeArTargets.placeId,
      description: placeArTargets.description,
      createdAt: placeArTargets.createdAt,
      updatedAt: placeArTargets.updatedAt,
      placeName: places.name,
      placeArchivedAt: places.archivedAt,
    })
    .from(placeArTargets)
    .innerJoin(places, eq(placeArTargets.placeId, places.id))
    .orderBy(places.name);
}

export type AdminArTargetRow = Awaited<ReturnType<typeof listArTargetsForAdmin>>[number];

/**
 * Stores or replaces a Place's reference hash.
 *
 * The hash arrives already computed by the admin's own browser; no image reaches
 * the server. Validation of its shape happens in the action's schema AND in a
 * database CHECK, so a malformed target cannot be stored by any path.
 */
export async function upsertArTarget(input: {
  placeId: string;
  targetHash: string;
  description: string | null;
  createdByUserId: string;
}): Promise<PlaceArTarget> {
  const [row] = await db
    .insert(placeArTargets)
    .values(input)
    .onConflictDoUpdate({
      target: placeArTargets.placeId,
      set: {
        targetHash: input.targetHash,
        description: input.description,
        createdByUserId: input.createdByUserId,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}

/**
 * Removes a Place's target.
 *
 * Deliberately harmless to history: visits already recorded by AR stay exactly as
 * they are. Deleting a target only stops future camera verification; it is not a
 * way to erase that somebody was there.
 */
export async function deleteArTarget(id: string): Promise<{ id: string; placeId: string } | null> {
  const [row] = await db
    .delete(placeArTargets)
    .where(eq(placeArTargets.id, id))
    .returning({ id: placeArTargets.id, placeId: placeArTargets.placeId });

  return row ?? null;
}
