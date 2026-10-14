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
  publicationStatus: z.enum([...PUBLICATION_STATUSES]).default("draft"),
  verificationStatus: z.enum([...VERIFICATION_STATUSES]).default("unverified"),
});

export type PlaceFormValues = z.infer<typeof placeSchema>;
