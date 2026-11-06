import "server-only";
import { db } from "@/db";
import {
  listAttractionPlacesForCatalogue as listAttractionsOperation,
  listCatalogueForAdmin as listCatalogueOperation,
  listContractRowsForCatalogue as listContractRowsOperation,
  listContractsForPlace as listContractsOperation,
} from "@/db/operations/atlas-contracts";
import type { MapBounds } from "@/services/eligibility/viewport";

/** Thin bindings of the production handle; the queries live in db/operations/atlas-contracts.ts. */
export async function listCatalogueForAdmin() {
  return listCatalogueOperation(db);
}

export async function listContractsForPlace(placeId: string) {
  return listContractsOperation(db, placeId);
}

/** Guest catalogue input: only services/eligibility may call these. */
export async function listContractRowsForCatalogue(hotelId: string, bounds?: MapBounds) {
  return listContractRowsOperation(db, hotelId, bounds);
}

export async function listAttractionPlacesForCatalogue(hotelId: string, bounds?: MapBounds) {
  return listAttractionsOperation(db, hotelId, bounds);
}
