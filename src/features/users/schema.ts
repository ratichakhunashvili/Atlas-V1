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
  /** How far the guest is happy to go. Narrows the Advisor's 5 km cap; can never widen it. */
  maxDistanceMeters: z.union([z.literal(null), z.coerce.number().int().min(250).max(5000)]),
});

/** The offered choices; a posted value is still validated against the schema, not trusted from this list. */
export const DISTANCE_PREFERENCE_OPTIONS = [
  { meters: 500, label: "About 500 m — right around the hotel" },
  { meters: 1000, label: "Up to 1 km" },
  { meters: 2000, label: "Up to 2 km" },
  { meters: 3000, label: "Up to 3 km" },
  { meters: 5000, label: "Up to 5 km (the most Atlas plans)" },
] as const;
