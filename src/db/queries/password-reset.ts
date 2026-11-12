import "server-only";
import { db } from "@/db";
import {
  consumeResetToken as consumeOperation,
  findUserIdByEmail as findOperation,
  isResetTokenUsable as usableOperation,
  issueResetToken as issueOperation,
} from "@/db/operations/password-reset";

/* Thin bindings of the production database handle; the logic is in db/operations/password-reset.ts. */

export const findUserIdByEmail = (email: string) => findOperation(db, email);
export const issueResetToken = (input: Parameters<typeof issueOperation>[1]) => issueOperation(db, input);
export const isResetTokenUsable = (tokenHash: string, now: Date) => usableOperation(db, tokenHash, now);
export const consumeResetToken = (input: Parameters<typeof consumeOperation>[1]) => consumeOperation(db, input);
