import { and, desc, eq, inArray, isNull, ne, notExists, sql, type SQL } from "drizzle-orm";
import { PG_UNIQUE_VIOLATION, hasPgErrorCode } from "@/db/errors";
import {
  atlasPartnerContracts,
  hotelFacilities,
  hotels,
  places,
  type AtlasContractStatus,
  type AtlasPartnerContract,
  type Place,
  type PlaceKind,
} from "@/db/schema";
import { isContractInForce } from "@/features/contracts/rules";
import type { ContractRow } from "@/services/eligibility/rules";
import type { MapBounds } from "@/services/eligibility/viewport";
import type { AtlasDatabase } from "./types";

/**
 * Atlas partner contracts and Place kinds (docs/catalogue-model-plan.md). The admin workflow, plus the two raw
 * catalogue reads that services/eligibility judges for guests; no other guest code reads these. Takes the database
 * handle as a parameter so db/atlas-contracts.pglite.test.ts exercises these exact queries.
 */

/** Contracts with these statuses block a new proposal (one pending, one active per Place). */
const OPEN_STATUSES: AtlasContractStatus[] = ["pending_review", "active"];
/** Contracts with these statuses keep the Place commercial, so its kind can't change away from business. */
const LIVE_STATUSES: AtlasContractStatus[] = ["pending_review", "active", "suspended"];

export async function findContractById(db: AtlasDatabase, id: string): Promise<AtlasPartnerContract | null> {
  const [row] = await db.select().from(atlasPartnerContracts).where(eq(atlasPartnerContracts.id, id)).limit(1);
  return row ?? null;
}

/** Every contract for one Place, newest first (history included). */
export async function listContractsForPlace(db: AtlasDatabase, placeId: string): Promise<AtlasPartnerContract[]> {
  return db
    .select()
    .from(atlasPartnerContracts)
    .where(eq(atlasPartnerContracts.placeId, placeId))
    .orderBy(desc(atlasPartnerContracts.createdAt));
}

/** The facts the pure rules in features/contracts/rules.ts need about one Place. */
export async function loadContractFacts(db: AtlasDatabase, placeId: string, now: Date = new Date()) {
  const [anchor] = await db.select({ id: hotels.id }).from(hotels).where(eq(hotels.placeId, placeId)).limit(1);
  const [facility] = await db.select({ id: hotelFacilities.id }).from(hotelFacilities).where(eq(hotelFacilities.placeId, placeId)).limit(1);
  const statuses = await db
    .select({
      status: atlasPartnerContracts.status,
      confirmedAt: atlasPartnerContracts.confirmedAt,
      startsAt: atlasPartnerContracts.startsAt,
      endsAt: atlasPartnerContracts.endsAt,
    })
    .from(atlasPartnerContracts)
    .where(eq(atlasPartnerContracts.placeId, placeId));
  return {
    isHotelAnchor: anchor !== undefined,
    isHotelFacility: facility !== undefined,
    hasOpenContract: statuses.some((row) => OPEN_STATUSES.includes(row.status)),
    hasLiveContract: statuses.some((row) => LIVE_STATUSES.includes(row.status)),
    /** An Atlas contract in force at `now`: the only thing a hotel partnership may promote. */
    hasContractInForce: statuses.some((row) => isContractInForce(row, now)),
  };
}

/** A new contract always starts pending_review. Returns null if the Place already has a pending one (unique index). */
export async function proposeContract(db: AtlasDatabase, placeId: string): Promise<AtlasPartnerContract | null> {
  try {
    const [row] = await db.insert(atlasPartnerContracts).values({ placeId, status: "pending_review" }).returning();
    return row;
  } catch (error) {
    if (hasPgErrorCode(error, PG_UNIQUE_VIOLATION)) return null;
    throw error;
  }
}

type ContractPatch = Partial<
  Pick<typeof atlasPartnerContracts.$inferInsert, "status" | "startsAt" | "endsAt" | "confirmedBy" | "confirmedAt" | "endedAt">
>;

/**
 * Compare-and-set: updates only while the row is still in one of `fromStatuses`, so two concurrent admin actions
 * can't both win. Returns null when the row no longer matches, or when activating would break "one active contract
 * per Place" (the partial unique index), so the caller reports it instead of crashing.
 */
export async function transitionContract(
  db: AtlasDatabase,
  id: string,
  fromStatuses: readonly AtlasContractStatus[],
  patch: ContractPatch,
  now: Date = new Date()
): Promise<AtlasPartnerContract | null> {
  try {
    const [row] = await db
      .update(atlasPartnerContracts)
      .set({ ...patch, updatedAt: now })
      .where(and(eq(atlasPartnerContracts.id, id), inArray(atlasPartnerContracts.status, [...fromStatuses])))
      .returning();
    return row ?? null;
  } catch (error) {
    if (hasPgErrorCode(error, PG_UNIQUE_VIOLATION)) return null;
    throw error;
  }
}

/** Sets a Place's kind as an explicit admin choice (kind_confirmed_at = now). */
export async function setPlaceKind(db: AtlasDatabase, placeId: string, kind: PlaceKind, now: Date = new Date()) {
  const [row] = await db
    .update(places)
    .set({ kind, kindConfirmedAt: now, updatedAt: now })
    .where(eq(places.id, placeId))
    .returning({ id: places.id, kind: places.kind, kindConfirmedAt: places.kindConfirmedAt });
  return row ?? null;
}

/**
 * ADMIN overview: every non-archived Place that is not a hotel, with its kind and all its contracts, so an admin sees
 * which businesses are in the network, which kinds are only suggestions, and what is waiting for review.
 */
export async function listCatalogueForAdmin(db: AtlasDatabase) {
  const rows = await db
    .select({
      id: places.id,
      name: places.name,
      category: places.category,
      kind: places.kind,
      kindConfirmedAt: places.kindConfirmedAt,
      archivedAt: places.archivedAt,
    })
    .from(places)
    .where(inArray(places.kind, ["business", "attraction"]))
    .orderBy(places.name);
  const contracts = await db.select().from(atlasPartnerContracts).orderBy(desc(atlasPartnerContracts.createdAt));
  const byPlace = new Map<string, AtlasPartnerContract[]>();
  for (const contract of contracts) {
    const list = byPlace.get(contract.placeId) ?? [];
    list.push(contract);
    byPlace.set(contract.placeId, list);
  }
  return rows.map((place) => ({ place, contracts: byPlace.get(place.id) ?? [] }));
}

export type AdminCatalogueRow = Awaited<ReturnType<typeof listCatalogueForAdmin>>[number];

/**
 * ADMIN Guest reach: every hotel, as the base whose guests' catalogue services/eligibility computes. Admin-only;
 * the verdict itself comes from services/eligibility, never from this read.
 */
export async function listHotelsForGuestReach(db: AtlasDatabase) {
  return db
    .select({ hotelId: hotels.id, hotelPlaceId: hotels.placeId, name: places.name })
    .from(hotels)
    .innerJoin(places, eq(hotels.placeId, places.id))
    .orderBy(places.name);
}

/**
 * ADMIN Guest reach: every Place that is not a hotel, with its contracts and facility rows, so the console can say WHY
 * a Place reaches no guest. Explanation input only; visibility is decided by services/eligibility.
 */
export async function listGuestReachCandidates(db: AtlasDatabase) {
  const rows = await db
    .select()
    .from(places)
    .where(and(ne(places.category, "hotel"), ne(places.kind, "hotel")))
    .orderBy(places.name);
  const contracts = await db
    .select({
      placeId: atlasPartnerContracts.placeId,
      status: atlasPartnerContracts.status,
      confirmedAt: atlasPartnerContracts.confirmedAt,
      startsAt: atlasPartnerContracts.startsAt,
      endsAt: atlasPartnerContracts.endsAt,
    })
    .from(atlasPartnerContracts);
  const facilities = await db.select({ placeId: hotelFacilities.placeId, hotelId: hotelFacilities.hotelId, status: hotelFacilities.status }).from(hotelFacilities);
  return rows.map((place) => ({
    place,
    contracts: contracts.filter((contract) => contract.placeId === place.id),
    facilities: facilities.filter((facility) => facility.placeId === place.id),
  }));
}

export type GuestReachCandidate = Awaited<ReturnType<typeof listGuestReachCandidates>>[number];

/**
 * GUEST catalogue input (phase C2): active contracts with their Place, for services/eligibility to judge. Rows whose
 * Place is another hotel's facility are left out here, because the pure rule cannot see facility ownership; the
 * guest's own hotel facilities reach the rule separately. The rule re-checks status, confirmation, window and Place.
 */
export async function listContractRowsForCatalogue(db: AtlasDatabase, hotelId: string, bounds?: MapBounds): Promise<ContractRow[]> {
  return db
    .select({
      id: atlasPartnerContracts.id,
      placeId: atlasPartnerContracts.placeId,
      status: atlasPartnerContracts.status,
      startsAt: atlasPartnerContracts.startsAt,
      endsAt: atlasPartnerContracts.endsAt,
      confirmedAt: atlasPartnerContracts.confirmedAt,
      place: places,
    })
    .from(atlasPartnerContracts)
    .innerJoin(places, eq(atlasPartnerContracts.placeId, places.id))
    .where(
and(eq(atlasPartnerContracts.status, "active"), notOtherHotelsFacility(db, hotelId), withinBounds(bounds))
    );
}

/**
 * GUEST catalogue input (phase C2): attraction Places. Like the contract read, it leaves out another hotel's facility
 * (an admin may have marked one as an attraction); services/eligibility re-checks kind and publication.
 */
export async function listAttractionPlacesForCatalogue(db: AtlasDatabase, hotelId: string, bounds?: MapBounds): Promise<Place[]> {
  return db
    .select()
    .from(places)
    .where(and(eq(places.kind, "attraction"), isNull(places.archivedAt), notOtherHotelsFacility(db, hotelId), withinBounds(bounds)));
}

/**
 * Optional map-area narrowing (phase C3), done in the database so a city-wide catalogue isn't read for one viewport.
 * Same expression as places_location_gist_idx, so the planner can answer it from that 2-D index; `<@` includes the
 * box's edges. services/eligibility re-checks the box and caps the result.
 */
export function withinBounds(bounds: MapBounds | undefined): SQL | undefined {
  if (!bounds) return undefined;
  return sql`point(${places.longitude}, ${places.latitude}) <@ box(point(${bounds.west}, ${bounds.south}), point(${bounds.east}, ${bounds.north}))`;
}

/** The Place is not a facility of any hotel other than `hotelId` (decision 5: other hotels' facilities never appear). */
function notOtherHotelsFacility(db: AtlasDatabase, hotelId: string) {
  return notExists(
    db
      .select({ id: hotelFacilities.id })
      .from(hotelFacilities)
      .where(and(eq(hotelFacilities.placeId, places.id), ne(hotelFacilities.hotelId, hotelId)))
  );
}
