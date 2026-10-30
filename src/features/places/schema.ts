import { z } from "zod";
import { PLACE_CATEGORIES, PUBLICATION_STATUSES, VERIFICATION_STATUSES } from "@/db/schema";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? undefined : value));

export const placeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: optionalText(2000),
  latitude: z.coerce
    .number()
    .min(-90, "Latitude must be between -90 and 90")
    .max(90, "Latitude must be between -90 and 90"),
  longitude: z.coerce
    .number()
    .min(-180, "Longitude must be between -180 and 180")
    .max(180, "Longitude must be between -180 and 180"),
  category: z.enum([...PLACE_CATEGORIES]),
  address: optionalText(300),
  imageUrl: optionalText(500),
  website: optionalText(300),
  phone: optionalText(50),
  /**
   * How long a guest should expect to spend here. Optional: left blank, the Advisor
   * uses an explicit per-category estimate instead. Bounded to match the places CHECK,
   * so a typo cannot swallow a guest's whole afternoon.
   */
  visitDurationMinutes: z
    .union([z.literal(""), z.coerce.number().int().min(1, "At least 1 minute").max(1440, "At most 24 hours")])
    .transform((value) => (value === "" ? null : (value as number))),
  /** 1 budget, 2 moderate, 3 luxury. Blank = unknown, which is never shown or ranked as affordable. */
  priceLevel: z
    .union([z.literal(""), z.coerce.number().int().min(1, "Price level is 1 to 3").max(3, "Price level is 1 to 3")])
    .transform((value) => (value === "" ? null : (value as number))),
  /** Where the price tier came from (a menu, the venue's own site, a phone call). Required whenever a price level is set. */
  priceLevelSource: optionalText(200),
  publicationStatus: z.enum([...PUBLICATION_STATUSES]).default("draft"),
  verificationStatus: z.enum([...VERIFICATION_STATUSES]).default("unverified"),
});

export type PlaceFormValues = z.infer<typeof placeSchema>;
