import { z } from "zod";
import { loginSchema, signupSchema } from "@/features/users/schema";

export const resetRequestSchema = z.object({ email: loginSchema.shape.email });

export const PASSWORD_MISMATCH_MESSAGE = "The two passwords don't match.";

/** Same strength rule as sign-up: it is reused, not copied. */
export const newPasswordSchema = z
  .object({ password: signupSchema.shape.password, confirm: z.string() })
  .refine((value) => value.password === value.confirm, { message: PASSWORD_MISMATCH_MESSAGE, path: ["confirm"] });
