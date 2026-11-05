import { notFound } from "next/navigation";
import { z } from "zod";

const uuidSchema = z.uuid();

export function isUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}

/**
 * For `[id]` route segments: a value that cannot be a record id is simply "not found". Without this, a
 * mistyped or truncated link reaches Postgres as an invalid uuid and the page fails with a server error.
 */
export function uuidOrNotFound(value: string): string {
  if (!isUuid(value)) notFound();
  return value;
}
