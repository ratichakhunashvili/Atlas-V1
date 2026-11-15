import { z } from "zod";
import { MAX_DAILY_TASK_LIMIT, MIN_DAILY_TASK_LIMIT } from "@/db/schema/hotels";

export const hotelSchema = z.object({
  placeId: z.uuid("Select a place"),
});

export type HotelFormValues = z.infer<typeof hotelSchema>;

/** "Tasks per day" on the hotel's admin page: a whole number from 1 to 4 (the database CHECK holds the same range). */
export const hotelTaskLimitSchema = z.object({
  dailyTaskLimit: z.coerce
    .number({ message: "Choose how many tasks a day can have" })
    .int("Choose a whole number of tasks")
    .min(MIN_DAILY_TASK_LIMIT, `Tasks per day must be between ${MIN_DAILY_TASK_LIMIT} and ${MAX_DAILY_TASK_LIMIT}`)
    .max(MAX_DAILY_TASK_LIMIT, `Tasks per day must be between ${MIN_DAILY_TASK_LIMIT} and ${MAX_DAILY_TASK_LIMIT}`),
});
