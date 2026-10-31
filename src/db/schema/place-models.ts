import { sql } from "drizzle-orm";
import { check, doublePrecision, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { places } from "./places";
import { enumCheck } from "./sql-helpers";

/**
 * The area Atlas supports a model display anchor in: Georgia with a small margin. The SAME numbers feed the database
 * CHECK below and the admin form validation, so a value that slips past one cannot pass the other.
 */
export const SUPPORTED_MODEL_REGION = { minLat: 40.9, maxLat: 43.7, minLng: 39.9, maxLng: 46.9 } as const;

export const MODEL_STATUSES = ["draft", "enabled"] as const;
export type ModelStatus = (typeof MODEL_STATUSES)[number];

/**
 * A 3D model attached to a canonical Place.
 *
 * One per Place, like the badge: the map draws at most one object per location, so
 * a second model would be an ambiguity rather than a feature.
 *
 * The model is an attachment, never a second copy of the Place. Position comes
 * from `places.latitude/longitude` at render time — nothing here stores
 * coordinates, so a corrected Place moves its model with it and the two can never
 * disagree.
 *
 * `storageKey` is the object store's own key, which is privileged: it is how a
 * file is overwritten or deleted. It is never sent to a browser; the client gets
 * only a resolved URL (services/storage).
 */
export const placeModels = pgTable(
  "place_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "restrict" }),
    /** Privileged: the key inside the object store. Server-side only. */
    storageKey: text("storage_key").notNull(),
    /** What the browser loads. Resolved from the storage service when the row is written. */
    fileUrl: text("file_url").notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    contentType: text("content_type").notNull(),
    /**
     * Draft models are configured but not drawn. An admin enables one deliberately,
     * so a half-placed building never appears on a guest's map.
     */
    status: text("status").notNull().default("draft").$type<ModelStatus>(),
    /** How tall the model should stand, in metres. The GLB's own units are normalised to this. */
    targetHeightMeters: doublePrecision("target_height_meters").notNull().default(10),
    /** Degrees clockwise from north. */
    rotationDegrees: doublePrecision("rotation_degrees").notNull().default(0),
    /** Metres above the ground anchor, for models that sit on a plinth or a roof. */
    elevationOffsetMeters: doublePrecision("elevation_offset_meters").notNull().default(0),
    /** A final multiplier after height normalisation, for fine adjustment. */
    scale: doublePrecision("scale").notNull().default(1),
    /**
     * Where the model is DRAWN, independent of the Place. Both null (the default, and every existing row) means "at
     * the Place's own coordinates". They are geographic coordinates — never a screen pixel — so the model stays put
     * through pan, zoom, pitch, bearing, resize and style changes. Display only: moving them never moves the
     * Place, its eligibility, its route destination, its check-in coordinates or its achievement.
     */
    anchorLatitude: doublePrecision("anchor_latitude"),
    anchorLongitude: doublePrecision("anchor_longitude"),
    /** Tilt about the east-west axis, degrees. */
    pitchDegrees: doublePrecision("pitch_degrees").notNull().default(0),
    /** Roll about the north-south axis, degrees. */
    rollDegrees: doublePrecision("roll_degrees").notNull().default(0),
    /** Per-axis stretch applied in model space, on top of height normalisation and the uniform `scale`. 1 = none. */
    scaleX: doublePrecision("scale_x").notNull().default(1),
    scaleY: doublePrecision("scale_y").notNull().default(1),
    scaleZ: doublePrecision("scale_z").notNull().default(1),
    uploadedByUserId: uuid("uploaded_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("place_models_place_unique").on(table.placeId),
    check("place_models_status_check", enumCheck(table.status, MODEL_STATUSES)),
    // A model with no height or a negative one cannot be drawn; the admin form
    // checks too, but a direct write must not be able to break the renderer.
    check("place_models_height_check", sql`${table.targetHeightMeters} > 0 and ${table.targetHeightMeters} <= 1000`),
    check("place_models_scale_check", sql`${table.scale} > 0 and ${table.scale} <= 100`),
    check("place_models_rotation_check", sql`${table.rotationDegrees} >= -360 and ${table.rotationDegrees} <= 360`),
    check(
      "place_models_elevation_check",
      sql`${table.elevationOffsetMeters} >= -1000 and ${table.elevationOffsetMeters} <= 1000`
    ),
    check(
      "place_models_anchor_pair_check",
      sql`(${table.anchorLatitude} is null) = (${table.anchorLongitude} is null)`
    ),
    check(
      "place_models_anchor_region_check",
      sql`${table.anchorLatitude} is null or (${table.anchorLatitude} between ${sql.raw(String(SUPPORTED_MODEL_REGION.minLat))} and ${sql.raw(String(SUPPORTED_MODEL_REGION.maxLat))} and ${table.anchorLongitude} between ${sql.raw(String(SUPPORTED_MODEL_REGION.minLng))} and ${sql.raw(String(SUPPORTED_MODEL_REGION.maxLng))})`
    ),
    check("place_models_pitch_check", sql`${table.pitchDegrees} between -180 and 180`),
    check("place_models_roll_check", sql`${table.rollDegrees} between -180 and 180`),
    check(
      "place_models_axis_scale_check",
      sql`${table.scaleX} > 0 and ${table.scaleX} <= 100 and ${table.scaleY} > 0 and ${table.scaleY} <= 100 and ${table.scaleZ} > 0 and ${table.scaleZ} <= 100`
    ),
    check("place_models_size_check", sql`${table.fileSizeBytes} > 0`),
  ]
);

export type PlaceModel = typeof placeModels.$inferSelect;
export type NewPlaceModel = typeof placeModels.$inferInsert;
