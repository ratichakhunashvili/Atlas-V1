import { z } from "zod";

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

const optionalPriority = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
      ctx.addIssue({ code: "custom", message: "Priority must be a whole number from 1 to 1000." });
      return z.NEVER;
    }
    return parsed;
  });

export const addPartnershipSchema = z.object({
  placeId: z.uuid("Select a place"),
});

export const confirmPartnershipSchema = z.object({
  startsAt: optionalDate,
  endsAt: optionalDate,
  priority: optionalPriority,
});

export const partnershipIdSchema = z.uuid("Invalid partnership");

/** Featured + offer, set per hotel partnership. An empty offer clears it. */
export const promotionSchema = z.object({
  featured: z.boolean(),
  offerText: z
    .string()
    .trim()
    .max(120, "Keep the offer to 120 characters or fewer.")
    .transform((value) => (value === "" ? null : value)),
});
