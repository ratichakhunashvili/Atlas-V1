import { z } from "zod";

export const checkInTokenSchema = z.object({
  token: z.string().trim().min(1, "Enter a hotel QR token"),
});
