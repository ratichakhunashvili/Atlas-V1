import { z } from "zod";

/**
 * An admin-created event. Times arrive as `datetime-local` strings, which carry
 * no timezone, so they are parsed into real Dates here and the ordering rule is
 * checked before anything reaches the database (which also enforces it).
 */
export const hotelEventSchema = z
  .object({
    venuePlaceId: z.string().uuid("Choose a venue"),
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z
      .string()
      .trim()
      .max(2000)
      .transform((value) => (value === "" ? null : value)),
    startsAt: z.coerce.date({ message: "Enter a start time" }),
    endsAt: z.coerce.date({ message: "Enter an end time" }),
  })
  .refine((value) => value.endsAt.getTime() > value.startsAt.getTime(), {
    message: "The event must end after it starts",
    path: ["endsAt"],
  });

export type HotelEventFormValues = z.infer<typeof hotelEventSchema>;
