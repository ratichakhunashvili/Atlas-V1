import { eq, sql } from "drizzle-orm";
import { hotelFacilities, hotels, places, type AdminAuditAction, type Place } from "@/db/schema";
import { recordAdminAudit } from "./admin-audit";
import type { AtlasDatabase } from "./types";

/**
 * Admin edits of a Place, written together with their audit entries in ONE transaction, so the audit trail can never
 * disagree with what actually changed (U090: detail edits used to leave no trace at all).
 *
 * Like every module under db/operations this takes the database handle as an argument and imports neither `@/db` nor
 * `server-only`, so the PGlite tests run the real code.
 */

/** What an admin can change on a Place through the edit form. Status fields have their own audit actions. */
export type PlaceUpdate = Partial<
  Pick<
    typeof places.$inferInsert,
    | "name"
    | "description"
    | "latitude"
    | "longitude"
    | "category"
    | "address"
    | "imageUrl"
    | "website"
    | "phone"
    | "visitDurationMinutes"
    | "priceLevel"
    | "priceLevelSource"
    | "priceLevelVerifiedAt"
    | "publicationStatus"
    | "verificationStatus"
  >
>;

/**
 * The descriptive fields a `place.updated` entry reports. Publication and verification are left out on purpose:
 * they already have their own entries (place.published, place.verified, ...). `priceLevelVerifiedAt` is left out
 * because it is derived from the price level and its source, which are reported.
 */
export const PLACE_DETAIL_FIELDS = [
  "name",
  "description",
  "latitude",
  "longitude",
  "category",
  "address",
  "imageUrl",
  "website",
  "phone",
  "visitDurationMinutes",
  "priceLevel",
  "priceLevelSource",
] as const satisfies readonly (keyof Place)[];

type DetailField = (typeof PLACE_DETAIL_FIELDS)[number];
type DetailSnapshot = Partial<Record<DetailField, Place[DetailField]>>;

/**
 * Only the descriptive fields whose stored value differs between two rows, as before/after snapshots; null when
 * nothing descriptive changed (a save without edits writes no entry). Compares stored rows, never form input, so a
 * value the database normalises cannot show up as a false change.
 */
export function changedPlaceDetails(
  before: Pick<Place, DetailField>,
  after: Pick<Place, DetailField>
): { before: DetailSnapshot; after: DetailSnapshot } | null {
  const changedBefore: DetailSnapshot = {};
  const changedAfter: DetailSnapshot = {};
  for (const field of PLACE_DETAIL_FIELDS) {
    if (before[field] === after[field]) continue;
    (changedBefore as Record<string, unknown>)[field] = before[field];
    (changedAfter as Record<string, unknown>)[field] = after[field];
  }
  return Object.keys(changedAfter).length > 0 ? { before: changedBefore, after: changedAfter } : null;
}

/** The status fields an audit entry needs from a Place — only what can change eligibility, never the whole row. */
export function placeStatusSnapshot(place: Pick<Place, "publicationStatus" | "verificationStatus" | "archivedAt">) {
  return {
    publicationStatus: place.publicationStatus,
    verificationStatus: place.verificationStatus,
    archived: place.archivedAt !== null,
  };
}

/** One audit action per eligibility-relevant status change between two versions of a Place. */
export function placeStatusAuditActions(
  before: Pick<Place, "publicationStatus" | "verificationStatus">,
  after: Pick<Place, "publicationStatus" | "verificationStatus">
): AdminAuditAction[] {
  const changes: Array<[AdminAuditAction, boolean]> = [
    ["place.published", before.publicationStatus !== "published" && after.publicationStatus === "published"],
    ["place.unpublished", before.publicationStatus === "published" && after.publicationStatus !== "published"],
    ["place.verified", before.verificationStatus !== "verified" && after.verificationStatus === "verified"],
    ["place.unverified", before.verificationStatus === "verified" && after.verificationStatus !== "verified"],
  ];
  return changes.filter(([, happened]) => happened).map(([action]) => action);
}

/**
 * The UPDATE itself. The status timestamp is kept when the status doesn't change and set/cleared when it does, in one
 * statement (no read-then-write race). The CHECK constraints guarantee status and timestamp always agree.
 */
export async function updatePlaceRow(db: AtlasDatabase, id: string, input: PlaceUpdate): Promise<Place | null> {
  const { publicationStatus, verificationStatus, ...rest } = input;
  const statusColumns = {
    ...(publicationStatus !== undefined && {
      publicationStatus,
      publishedAt: publicationStatus === "published" ? sql`coalesce(${places.publishedAt}, now())` : sql`null`,
    }),
    ...(verificationStatus !== undefined && {
      verificationStatus,
      verifiedAt: verificationStatus === "verified" ? sql`coalesce(${places.verifiedAt}, now())` : sql`null`,
    }),
  };
  const [place] = await db
    .update(places)
    .set({ ...rest, ...statusColumns, updatedAt: new Date() })
    .where(eq(places.id, id))
    .returning();
  return place ?? null;
}

/** The hotel a Place belongs to, when it has one: as that hotel's own Place, or as one of its facilities. */
async function hotelIdForPlace(db: AtlasDatabase, placeId: string): Promise<string | null> {
  const [anchor] = await db.select({ id: hotels.id }).from(hotels).where(eq(hotels.placeId, placeId)).limit(1);
  if (anchor) return anchor.id;
  const [facility] = await db
    .select({ hotelId: hotelFacilities.hotelId })
    .from(hotelFacilities)
    .where(eq(hotelFacilities.placeId, placeId))
    .limit(1);
  return facility?.hotelId ?? null;
}

/**
 * Saves an admin's edit of a Place and its audit entries atomically: one `place.updated` holding only the descriptive
 * fields that changed, plus one entry per publication/verification change. If any part fails (a CHECK violation,
 * the audit insert) nothing is saved. Returns the before/after rows, or null when the Place does not exist.
 */
export async function updatePlaceWithAudit(
  db: AtlasDatabase,
  input: { actorUserId: string; placeId: string; changes: PlaceUpdate; now?: Date }
): Promise<{ before: Place; after: Place } | null> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(places).where(eq(places.id, input.placeId)).for("update").limit(1);
    if (!before) return null;

    const after = await updatePlaceRow(tx, input.placeId, input.changes);
    if (!after) return null;

    const details = changedPlaceDetails(before, after);
    const statusActions = placeStatusAuditActions(before, after);
    if (!details && statusActions.length === 0) return { before, after };

    const hotelId = await hotelIdForPlace(tx, input.placeId);
    if (details) {
      await recordAdminAudit(tx, {
        actorUserId: input.actorUserId,
        action: "place.updated",
        targetType: "place",
        targetId: input.placeId,
        hotelId,
        before: details.before,
        after: details.after,
        now: input.now,
      });
    }
    for (const action of statusActions) {
      await recordAdminAudit(tx, {
        actorUserId: input.actorUserId,
        action,
        targetType: "place",
        targetId: input.placeId,
        hotelId,
        before: placeStatusSnapshot(before),
        after: placeStatusSnapshot(after),
        now: input.now,
      });
    }
    return { before, after };
  });
}
