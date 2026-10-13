import { z } from "zod";
import { ACTIVITY_LEVELS, BUDGET_LEVELS, PLACE_CATEGORIES } from "@/db/schema";

export const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const signupSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const preferencesSchema = z.object({
  categories: z.array(z.enum([...PLACE_CATEGORIES])).max(PLACE_CATEGORIES.length),
  budget: z.enum([...BUDGET_LEVELS]).nullable(),
  activityLevel: z.enum([...ACTIVITY_LEVELS]).nullable(),
});
