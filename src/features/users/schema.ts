import { z } from "zod";
import { ACTIVITY_LEVELS, BUDGET_LEVELS, PLACE_CATEGORIES } from "@/db/schema";

/** Emails are compared case-insensitively: stored and looked up trimmed and lower-case, so "Nino@x" and "nino@x" are one account. */
const normalisedEmail = (message: string) => z.string().trim().toLowerCase().pipe(z.email(message));

export const loginSchema = z.object({
  email: normalisedEmail("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

/** Each rule says what is actually wrong, so a merely short password is not called "easy to guess". */
export const PASSWORD_TOO_SHORT_MESSAGE = "Password is too short. Use at least 8 characters.";
export const PASSWORD_NEEDS_LETTER_MESSAGE = "Add at least one letter to your password.";
export const PASSWORD_NEEDS_NUMBER_MESSAGE = "Add at least one number to your password.";
/** Kept for callers that want the full rule in one sentence. */
export const WEAK_PASSWORD_MESSAGE = "Use at least 8 characters with a letter and a number.";

export const signupSchema = z.object({
  /** Optional; an empty field is stored as no name. */
  name: z
    .string()
    .trim()
    .max(60, "Keep your name under 60 characters")
    .transform((value) => value || null),
  email: normalisedEmail("Enter a full email address, like name@example.com"),
  password: z
    .string()
    .min(8, PASSWORD_TOO_SHORT_MESSAGE)
    .max(200, "Use 200 characters or fewer")
    .regex(/[A-Za-z]/, PASSWORD_NEEDS_LETTER_MESSAGE)
    .regex(/[0-9]/, PASSWORD_NEEDS_NUMBER_MESSAGE),
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
