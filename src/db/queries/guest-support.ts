import "server-only";
import { db } from "@/db";
import { lookupGuestForSupport as lookupOperation, moveGuestToHotel as moveOperation } from "@/db/operations/guest-support";

/** Thin binding; the minimal view, the required reason and the same-transaction audit entry live in db/operations/guest-support.ts. */
export async function lookupGuestForSupport(input: {
  actorUserId: string;
  email: string;
  reasonCode: string;
  note?: string;
}) {
  return lookupOperation(db, input);
}

export async function moveGuestToHotel(input: { actorUserId: string; email: string; toHotelId: string; reasonCode: string; note?: string }) {
  return moveOperation(db, input);
}
