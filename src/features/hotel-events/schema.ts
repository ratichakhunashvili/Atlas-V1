import { z } from "zod";
import { parseTbilisiDateTime } from "./time";

function tbilisiDateTime(message: string) {
  return z.string().transform((value, ctx) => {
    const date = parseTbilisiDateTime(value.trim());
    if (!date) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return date;
  });
}

/**
 * An admin-created event. Times arrive as `datetime-local` strings, which carry
 * no timezone; they are read as Tbilisi time (see ./time) and the ordering rule
 * is checked before anything reaches the database (which also enforces it).
 */
export const hotelEventSchema = z
  .object({
    venuePlaceId: z.uuid("Choose a venue."),
    title: z.string().trim().min(1, "Enter a title.").max(200),
    description: z
      .string()
      .trim()
      .max(2000)
      .transform((value) => (value === "" ? null : value)),
    startsAt: tbilisiDateTime("Enter a start time."),
    endsAt: tbilisiDateTime("Enter an end time."),
  })
  .refine((value) => value.endsAt.getTime() > value.startsAt.getTime(), {
    message: "The event must end after it starts.",
    path: ["endsAt"],
  });

export type HotelEventFormValues = z.infer<typeof hotelEventSchema>;
