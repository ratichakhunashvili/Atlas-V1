import { eq } from "drizzle-orm";
import { hotels, places, type Hotel, type PlaceKind } from "@/db/schema";
import { recordAdminAudit } from "./admin-audit";
import type { AtlasDatabase } from "./types";

/**
 * Creating a hotel and changing which Place it is, each written with its audit entry in ONE transaction (U090: these
 * used to leave no trace). Takes the database handle as an argument so the PGlite tests run the real code.
 */

/** A hotel's anchor Place is certainly a hotel (docs/catalogue-model-plan.md): record that kind as confirmed. */
export async function markPlaceAsHotel(db: Pick<AtlasDatabase, "update">, placeId: string, now: Date = new Date()) {
  await db.update(places).set({ kind: "hotel", kindConfirmedAt: now, updatedAt: now }).where(eq(places.id, placeId));
}

async function placeKind(db: AtlasDatabase, placeId: string): Promise<PlaceKind | null> {
  const [row] = await db.select({ kind: places.kind }).from(places).where(eq(places.id, placeId)).for("update").limit(1);
  return row?.kind ?? null;
}

/**
 * Creates the hotel, confirms its Place as a hotel, and writes `hotel.created`. When the Place's kind changes, that
 * change is part of the same entry (placeKind before/after) rather than a second one. A unique violation (the Place
 * already belongs to a hotel) propagates and rolls everything back, so a refused creation leaves no entry.
 */
export async function createHotelWithAudit(
  db: AtlasDatabase,
  input: { actorUserId: string; placeId: string; now?: Date }
): Promise<Hotel> {
  return db.transaction(async (tx) => {
    const kindBefore = await placeKind(tx, input.placeId);
    const [hotel] = await tx.insert(hotels).values({ placeId: input.placeId }).returning();
    await markPlaceAsHotel(tx, input.placeId, input.now);
    const kindChanged = kindBefore !== null && kindBefore !== "hotel";
    await recordAdminAudit(tx, {
      actorUserId: input.actorUserId,
      action: "hotel.created",
      targetType: "hotel",
      targetId: hotel.id,
      hotelId: hotel.id,
      before: kindChanged ? { placeKind: kindBefore } : null,
      after: { placeId: input.placeId, ...(kindChanged ? { placeKind: "hotel" } : {}) },
      now: input.now,
    });
    return hotel;
  });
}

/**
 * Points a hotel at a different Place and writes `hotel.updated` with the old and new Place (and the new Place's kind
 * change, when there is one). Saving the same Place again changes nothing and writes nothing. Returns null when the
 * hotel does not exist; a unique violation propagates and rolls everything back.
 */
export async function updateHotelPlaceWithAudit(
  db: AtlasDatabase,
  input: { actorUserId: string; hotelId: string; placeId: string; now?: Date }
): Promise<{ hotel: Hotel; changed: boolean } | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(hotels).where(eq(hotels.id, input.hotelId)).for("update").limit(1);
    if (!current) return null;
    if (current.placeId === input.placeId) return { hotel: current, changed: false };

    const now = input.now ?? new Date();
    const kindBefore = await placeKind(tx, input.placeId);
    const [hotel] = await tx
      .update(hotels)
      .set({ placeId: input.placeId, updatedAt: now })
      .where(eq(hotels.id, input.hotelId))
      .returning();
    await markPlaceAsHotel(tx, input.placeId, now);
    const kindChanged = kindBefore !== null && kindBefore !== "hotel";
    await recordAdminAudit(tx, {
      actorUserId: input.actorUserId,
      action: "hotel.updated",
      targetType: "hotel",
      targetId: hotel.id,
      hotelId: hotel.id,
      before: { placeId: current.placeId, ...(kindChanged ? { placeKind: kindBefore } : {}) },
      after: { placeId: input.placeId, ...(kindChanged ? { placeKind: "hotel" } : {}) },
      now: input.now,
    });
    return { hotel, changed: true };
  });
}
