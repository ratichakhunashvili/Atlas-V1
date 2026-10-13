import "server-only";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required. Copy .env.example to .env.local."),
  AUTH_SECRET: z
    .string()
    .min(1, "AUTH_SECRET is required. Generate one with: npx auth secret"),
  NEXT_PUBLIC_MAPBOX_TOKEN: z.string().optional(),
  MAPBOX_SERVER_TOKEN: z.string().optional(),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  MAPBOX_SERVER_TOKEN: process.env.MAPBOX_SERVER_TOKEN,
});
