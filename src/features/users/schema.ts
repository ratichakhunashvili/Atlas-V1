import { z } from "zod";
import { ACTIVITY_LEVELS, BUDGET_LEVELS, PLACE_CATEGORIES } from "@/db/schema";

export const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const WEAK_PASSWORD_MESSAGE = "Too easy to guess. Use at least 8 characters with a letter and a number.";

export const signupSchema = z.object({
  /** Optional; an empty field is stored as no name. */
  name: z
    .string()
    .trim()
    .max(60, "Keep your name under 60 characters")
    .transform((value) => value || null),
  email: z.email("Enter a full email address, like name@example.com"),
  password: z
    .string()
    .min(8, WEAK_PASSWORD_MESSAGE)
    .max(200, "Use 200 characters or fewer")
    .regex(/[A-Za-z]/, WEAK_PASSWORD_MESSAGE)
    .regex(/[0-9]/, WEAK_PASSWORD_MESSAGE),
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
