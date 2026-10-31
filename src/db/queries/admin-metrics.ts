import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { hotelPartnerships, hotels, places } from "@/db/schema";
import {
  dashboardCounts as countsOperation,
  hotelEngagement as engagementOperation,
  recentUse as recentUseOperation,
} from "@/db/operations/admin-metrics";

/** Thin bindings of the production handle; the SQL lives in db/operations/admin-metrics.ts, where PGlite tests exercise it. */
export async function dashboardCounts(now: Date = new Date()) {
  return countsOperation(db, now);
}

export async function recentUse(input: { since: Date; until: Date }) {
  return recentUseOperation(db, input);
}

export async function hotelEngagement(input: { since: Date; until: Date }) {
  return engagementOperation(db, input);
}

/** The partnership review queue: proposals waiting for an admin decision, oldest first, with enough to open the right hotel. */
export async function listPendingPartnershipQueue(limit = 10) {
  return db
    .select({
      id: hotelPartnerships.id,
      hotelId: hotelPartnerships.hotelId,
      createdAt: hotelPartnerships.createdAt,
      placeName: places.name,
    })
    .from(hotelPartnerships)
    .innerJoin(places, eq(places.id, hotelPartnerships.placeId))
    .where(eq(hotelPartnerships.status, "pending_review"))
    .orderBy(asc(hotelPartnerships.createdAt))
    .limit(limit);
}

export async function hotelNamesById(): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: hotels.id, name: places.name })
    .from(hotels)
    .innerJoin(places, eq(places.id, hotels.placeId))
    .orderBy(desc(hotels.createdAt));
  return new Map(rows.map((row) => [row.id, row.name]));
}
