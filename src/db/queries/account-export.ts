import "server-only";
import { db } from "@/db";
import { gatherAccountExport as gatherOperation } from "@/db/operations/account-export";

/** Thin binding of the production handle; the query lives in db/operations/account-export.ts. */
export async function gatherAccountExport(userId: string, now: Date = new Date()) {
  return gatherOperation(db, userId, now);
}
