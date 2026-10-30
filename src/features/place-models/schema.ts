import { z } from "zod";
import { MODEL_STATUSES, SUPPORTED_MODEL_REGION } from "@/db/schema";

/** A blank number field means "not set" (null), anything else must be a real number. */
const optionalNumber = (min: number, max: number, label: string) =>
  z
    .union([z.literal(""), z.coerce.number().finite().min(min, `${label} is out of range`).max(max, `${label} is out of range`)])
    .transform((value) => (value === "" ? null : (value as number)));

/**
 * Placement settings an admin can set. Every bound matches a database CHECK, so a
 * value that slips past the form still cannot break the renderer.
 *
 * These are DISPLAY fields only. None of them is a Place field, and nothing here can name one: the anchor is where
 * the model is drawn, and the linked Place's own coordinates stay authoritative for everything else.
 */
export const modelSettingsSchema = z.object({
  status: z.enum([...MODEL_STATUSES]),
  /** How tall the model should stand. A kilometre is already absurd; beyond that it is a typo. */
  targetHeightMeters: z.coerce.number().finite().gt(0).max(1000),
  /** Heading (yaw), degrees clockwise from north. */
  rotationDegrees: z.coerce.number().finite().min(-360).max(360),
  pitchDegrees: z.coerce.number().finite().min(-180).max(180),
  rollDegrees: z.coerce.number().finite().min(-180).max(180),
  elevationOffsetMeters: z.coerce.number().finite().min(-1000).max(1000),
  /** Uniform multiplier applied after height normalisation. */
  scale: z.coerce.number().finite().gt(0).max(100),
  scaleX: z.coerce.number().finite().gt(0).max(100),
  scaleY: z.coerce.number().finite().gt(0).max(100),
  scaleZ: z.coerce.number().finite().gt(0).max(100),
  /** Blank = draw at the Place. Both or neither; checked again, with the Place, by validateAnchor. */
  anchorLatitude: optionalNumber(SUPPORTED_MODEL_REGION.minLat, SUPPORTED_MODEL_REGION.maxLat, "Anchor latitude"),
  anchorLongitude: optionalNumber(SUPPORTED_MODEL_REGION.minLng, SUPPORTED_MODEL_REGION.maxLng, "Anchor longitude"),
  /** Ticked when the admin has seen the "drawn far from the real place" warning and means it. */
  confirmLargeSeparation: z.preprocess((value) => value === "on" || value === "1" || value === true, z.boolean()),
});

export const placeIdSchema = z.string().uuid("Choose a place");
export const modelIdSchema = z.string().uuid();

export type ModelSettingsValues = z.infer<typeof modelSettingsSchema>;
