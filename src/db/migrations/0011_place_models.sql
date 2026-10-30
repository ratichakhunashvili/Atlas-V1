CREATE TABLE "place_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"file_url" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"content_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"target_height_meters" double precision DEFAULT 10 NOT NULL,
	"rotation_degrees" double precision DEFAULT 0 NOT NULL,
	"elevation_offset_meters" double precision DEFAULT 0 NOT NULL,
	"scale" double precision DEFAULT 1 NOT NULL,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_models_place_unique" UNIQUE("place_id"),
	CONSTRAINT "place_models_status_check" CHECK ("place_models"."status" in ('draft', 'enabled')),
	CONSTRAINT "place_models_height_check" CHECK ("place_models"."target_height_meters" > 0 and "place_models"."target_height_meters" <= 1000),
	CONSTRAINT "place_models_scale_check" CHECK ("place_models"."scale" > 0 and "place_models"."scale" <= 100),
	CONSTRAINT "place_models_rotation_check" CHECK ("place_models"."rotation_degrees" >= -360 and "place_models"."rotation_degrees" <= 360),
	CONSTRAINT "place_models_elevation_check" CHECK ("place_models"."elevation_offset_meters" >= -1000 and "place_models"."elevation_offset_meters" <= 1000),
	CONSTRAINT "place_models_size_check" CHECK ("place_models"."file_size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "place_models" ADD CONSTRAINT "place_models_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE restrict ON UPDATE no action;