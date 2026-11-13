import "server-only";
import { db } from "@/db";
import {
  findGoogleLinkedAccount as findLinkedOperation,
  resolveGoogleSignIn as resolveOperation,
  type GoogleProfileClaims,
} from "@/db/operations/google-sign-in";

/** The Google sign-in operations (db/operations/google-sign-in.ts) bound to the app's database. */
export function resolveGoogleSignIn(claims: GoogleProfileClaims, now: Date) {
  return resolveOperation(db, claims, now);
}

export function findGoogleLinkedAccount(sub: string) {
  return findLinkedOperation(db, sub);
}
