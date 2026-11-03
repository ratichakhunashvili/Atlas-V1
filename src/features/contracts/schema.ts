import { z } from "zod";
import { PLACE_KINDS } from "@/db/schema";

const optionalDate = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date." });
      return z.NEVER;
    }
    return parsed;
  });

export const contractIdSchema = z.uuid("Invalid contract");
export const placeIdSchema = z.uuid("Invalid place");

export const confirmContractSchema = z.object({
  startsAt: optionalDate,
  endsAt: optionalDate,
});

export const placeKindSchema = z.object({
  kind: z.enum(PLACE_KINDS, "Choose a kind"),
});
