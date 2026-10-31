import "server-only";
import { db } from "@/db";
import {
  clearPendingHotelSwitch as clearOperation,
  findPendingHotelSwitch as findOperation,
  recordPendingHotelSwitch as recordOperation,
} from "@/db/operations/pending-hotel-switches";

/*
 * Thin bindings of the production database handle. All logic lives in
 * db/operations/pending-hotel-switches.ts so the PGlite tests can call the real
 * operations rather than re-implementing their SQL.
 */

export async function recordPendingHotelSwitch(input: { userId: string; hotelId: string; now: Date }) {
  return recordOperation(db, input);
}

export async function findPendingHotelSwitch(userId: string, now: Date) {
  return findOperation(db, userId, now);
}

export async function clearPendingHotelSwitch(userId: string) {
  return clearOperation(db, userId);
}
