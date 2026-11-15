import { asc, eq } from "drizzle-orm";
import { hotelDayProgramSteps, hotels } from "@/db/schema";
import { validateDayProgram, type DayProgramStepInput } from "@/features/hotels/day-program";
import { recordAdminAudit } from "./admin-audit";
import type { AtlasDatabase } from "./types";

/** A hotel's day program, steps in order (empty = no program: the normal daily plan). */
export async function listDayProgram(db: Pick<AtlasDatabase, "select">, hotelId: string): Promise<DayProgramStepInput[]> {
  const rows = await db
    .select({ position: hotelDayProgramSteps.position, placeIds: hotelDayProgramSteps.placeIds })
    .from(hotelDayProgramSteps)
    .where(eq(hotelDayProgramSteps.hotelId, hotelId))
    .orderBy(asc(hotelDayProgramSteps.position));
  return rows;
}

const snapshot = (steps: readonly DayProgramStepInput[]) => steps.map((step) => step.placeIds);

export type ReplaceDayProgramResult = { ok: true; changed: boolean } | { ok: false; reason: "no_hotel" | "invalid"; error?: string };

/**
 * Replaces the whole program and writes `hotel.updated` with the program before and after, in ONE transaction. The
 * hotel row is locked first, so two admins saving at once are applied one after the other. The program is validated
 * again here (1-3 places per step, at most 4 steps, no place twice), whatever the caller did. An empty program clears
 * it. Saving the same program again changes nothing and writes nothing. Any failure rolls back program and audit together.
 */
export async function replaceDayProgramWithAudit(
  db: AtlasDatabase,
  input: { actorUserId: string; hotelId: string; steps: readonly (readonly string[])[]; now?: Date }
): Promise<ReplaceDayProgramResult> {
  const valid = validateDayProgram(input.steps);
  if (!valid.ok) return { ok: false, reason: "invalid", error: valid.error };
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const [hotel] = await tx.select({ id: hotels.id }).from(hotels).where(eq(hotels.id, input.hotelId)).for("update").limit(1);
    if (!hotel) return { ok: false, reason: "no_hotel" } as const;

    const before = await listDayProgram(tx, input.hotelId);
    if (JSON.stringify(snapshot(before)) === JSON.stringify(snapshot(valid.steps))) return { ok: true, changed: false } as const;

    await tx.delete(hotelDayProgramSteps).where(eq(hotelDayProgramSteps.hotelId, input.hotelId));
    if (valid.steps.length > 0) {
      await tx.insert(hotelDayProgramSteps).values(
        valid.steps.map((step) => ({ hotelId: input.hotelId, position: step.position, placeIds: step.placeIds, createdAt: now, updatedAt: now }))
      );
    }
    await recordAdminAudit(tx, {
      actorUserId: input.actorUserId,
      action: "hotel.updated",
      targetType: "hotel",
      targetId: input.hotelId,
      hotelId: input.hotelId,
      before: { dayProgram: snapshot(before) },
      after: { dayProgram: snapshot(valid.steps) },
      now,
    });
    return { ok: true, changed: true } as const;
  });
}
