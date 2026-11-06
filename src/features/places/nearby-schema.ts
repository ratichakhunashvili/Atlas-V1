import { z } from "zod";
import { MAX_MAP_RADIUS_METERS, MIN_MAP_RADIUS_METERS } from "@/services/eligibility";

export const DEFAULT_NEARBY_RADIUS_METERS = 5000;

/**
 * Query for /api/places/nearby. Only the map AREA is client-controlled.
 * Zod's default object parsing STRIPS unknown keys, so a forged `hotelId` /
 * `placeId` in the query string never reaches the service — the hotel always
 * comes from the authenticated guest's own active stay.
 */
export const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(MIN_MAP_RADIUS_METERS).max(MAX_MAP_RADIUS_METERS).optional(),
});

export type NearbyQuery = z.infer<typeof nearbyQuerySchema>;

/**
 * Query for /api/places/viewport: the visible map box. Only the AREA is client-controlled, and unknown keys are
 * stripped as above. The service clamps an oversized box and caps the result, so a forged box can only narrow.
 */
export const viewportQuerySchema = z
  .object({
    south: z.coerce.number().min(-90).max(90),
    west: z.coerce.number().min(-180).max(180),
    north: z.coerce.number().min(-90).max(90),
    east: z.coerce.number().min(-180).max(180),
  })
  .refine((box) => box.south <= box.north && box.west <= box.east, { message: "south/west must not exceed north/east" });

export type ViewportQuery = z.infer<typeof viewportQuerySchema>;
