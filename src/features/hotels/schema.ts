import { z } from "zod";

export const hotelSchema = z.object({
  placeId: z.uuid("Select a place"),
});

export type HotelFormValues = z.infer<typeof hotelSchema>;
