import { and, eq, ne } from "drizzle-orm";
import { PG_UNIQUE_VIOLATION, hasPgErrorCode } from "@/db/errors";
import { hotelFacilities, type FacilityStatus, type FacilityType, type HotelFacility } from "@/db/schema";
import { recordAdminAudit } from "./admin-audit";
import type { AtlasDatabase } from "./types";

/**
 * Registering a hotel-owned facility and switching it on or off, each written with its audit entry in ONE transaction
 * (U090; the product rule asks for facilities to be managed with status, dates and audit history).
 */

/**
 * Registers the facility (active) and writes `facility.added`. Returns null when the Place is already some hotel's
 * facility: the unique violation aborts the transaction, so it is caught outside it and nothing is recorded.
 */
export async function addFacilityWithAudit(
  db: AtlasDatabase,
  input: { actorUserId: string; hotelId: string; placeId: string; facilityType: FacilityType; now?: Date }
): Promise<HotelFacility | null> {
  try {
    return await db.transaction(async (tx) => {
      const [facility] = await tx
        .insert(hotelFacilities)
        .values({ hotelId: input.hotelId, placeId: input.placeId, facilityType: input.facilityType, status: "active" })
        .returning();
      await recordAdminAudit(tx, {
        actorUserId: input.actorUserId,
        action: "facility.added",
        targetType: "hotel_facility",
        targetId: facility.id,
        hotelId: facility.hotelId,
        after: { placeId: facility.placeId, facilityType: facility.facilityType, status: facility.status },
        now: input.now,
      });
      return facility;
    });
  } catch (error) {
    if (hasPgErrorCode(error, PG_UNIQUE_VIOLATION)) return null;
    throw error;
  }
}

/**
 * Activates or deactivates a facility and writes `facility.reactivated` / `facility.deactivated`. The UPDATE only
 * matches a row whose status differs, so a double submit (or a second tab) changes nothing the second time and writes
 * exactly one entry. Returns null when the facility does not exist.
 */
export async function setFacilityStatusWithAudit(
  db: AtlasDatabase,
  input: { actorUserId: string; facilityId: string; status: FacilityStatus; now?: Date }
): Promise<{ facility: HotelFacility; changed: boolean } | null> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(hotelFacilities).where(eq(hotelFacilities.id, input.facilityId)).for("update").limit(1);
    if (!before) return null;

    const [facility] = await tx
      .update(hotelFacilities)
      .set({ status: input.status, updatedAt: input.now ?? new Date() })
      .where(and(eq(hotelFacilities.id, input.facilityId), ne(hotelFacilities.status, input.status)))
      .returning();
    if (!facility) return { facility: before, changed: false };

    await recordAdminAudit(tx, {
      actorUserId: input.actorUserId,
      action: input.status === "active" ? "facility.reactivated" : "facility.deactivated",
      targetType: "hotel_facility",
      targetId: facility.id,
      hotelId: facility.hotelId,
      before: { status: before.status },
      after: { status: facility.status },
      now: input.now,
    });
    return { facility, changed: true };
  });
}
