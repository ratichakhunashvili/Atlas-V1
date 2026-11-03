import "server-only";
import { db } from "@/db";
import { listCatalogueForAdmin as listCatalogueOperation, listContractsForPlace as listContractsOperation } from "@/db/operations/atlas-contracts";

/** Thin bindings of the production handle; the queries live in db/operations/atlas-contracts.ts. Admin-only. */
export async function listCatalogueForAdmin() {
  return listCatalogueOperation(db);
}

export async function listContractsForPlace(placeId: string) {
  return listContractsOperation(db, placeId);
}
