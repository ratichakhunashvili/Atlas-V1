import { z } from "zod";
import { MAX_DAY_PROGRAM_STEP_PLACES, MAX_DAY_PROGRAM_STEPS } from "@/db/schema/hotel-day-program";

/**
 * The hotel admin's "Day program" form, validated on the server. Pure: no DB.
 *
 * The form has one row per possible step (MAX_DAY_PROGRAM_STEPS), each with an "order" number and up to three place
 * fields. Rows with no place are dropped (that is how a step is removed); the rest are sorted by their order number
 * (ties keep the form order) and renumbered 1..n (that is how steps are reordered). No rows left = no program: the
 * hotel goes back to the normal daily plan.
 */

export type DayProgramStepInput = { position: number; placeIds: string[] };

export const dayProgramSchema = z
  .array(
    z
      .array(z.uuid("Choose places from the list"))
      .min(1, "Each step needs at least one place")
      .max(MAX_DAY_PROGRAM_STEP_PLACES, `A step can list at most ${MAX_DAY_PROGRAM_STEP_PLACES} places`)
  )
  .max(MAX_DAY_PROGRAM_STEPS, `A day program has at most ${MAX_DAY_PROGRAM_STEPS} steps`)
  .superRefine((steps, ctx) => {
    const seen = new Set<string>();
    for (const placeId of steps.flat()) {
      if (seen.has(placeId)) {
        ctx.addIssue({ code: "custom", message: "A place can appear only once in the day program" });
        return;
      }
      seen.add(placeId);
    }
  });

export type DayProgramParse = { ok: true; steps: DayProgramStepInput[] } | { ok: false; error: string };

/** Validates a program given as ordered lists of place ids, and numbers the steps 1..n. */
export function validateDayProgram(steps: readonly (readonly string[])[]): DayProgramParse {
  const parsed = dayProgramSchema.safeParse(steps.map((step) => [...step]));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid day program" };
  return { ok: true, steps: parsed.data.map((placeIds, i) => ({ position: i + 1, placeIds })) };
}

/** Reads the admin form (field names `step<i>_order`, `step<i>_place<j>`) into a validated program. */
export function parseDayProgramForm(read: (name: string) => unknown): DayProgramParse {
  const rows: { order: number; index: number; placeIds: string[] }[] = [];
  for (let i = 0; i < MAX_DAY_PROGRAM_STEPS; i++) {
    const placeIds: string[] = [];
    for (let j = 0; j < MAX_DAY_PROGRAM_STEP_PLACES; j++) {
      const value = read(`step${i}_place${j}`);
      if (typeof value === "string" && value.trim() !== "") placeIds.push(value.trim());
    }
    if (placeIds.length === 0) continue;
    const orderValue = Number(read(`step${i}_order`));
    rows.push({ order: Number.isFinite(orderValue) ? orderValue : i + 1, index: i, placeIds });
  }
  rows.sort((a, b) => a.order - b.order || a.index - b.index);
  return validateDayProgram(rows.map((row) => row.placeIds));
}

/** Place ids in the program that are not in the hotel's eligible catalogue right now (an admin may only choose those). */
export function placesOutsideCatalogue(steps: readonly DayProgramStepInput[], eligibleIds: ReadonlySet<string>): string[] {
  return steps.flatMap((step) => step.placeIds).filter((id) => !eligibleIds.has(id));
}
