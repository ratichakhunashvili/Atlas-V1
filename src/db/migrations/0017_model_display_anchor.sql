ALTER TABLE "place_models" ADD COLUMN "anchor_latitude" double precision;--> statement-breakpoint
ALTER TABLE "place_models" ADD COLUMN "anchor_longitude" double precision;--> statement-breakpoint
ALTER TABLE "place_models" ADD COLUMN "pitch_degrees" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "place_models" ADD COLUMN "roll_degrees" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "place_models" ADD COLUMN "scale_x" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "place_models" ADD COLUMN "scale_y" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "place_models" ADD COLUMN "scale_z" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "place_models" ADD CONSTRAINT "place_models_anchor_pair_check" CHECK (("place_models"."anchor_latitude" is null) = ("place_models"."anchor_longitude" is null));--> statement-breakpoint
ALTER TABLE "place_models" ADD CONSTRAINT "place_models_anchor_region_check" CHECK ("place_models"."anchor_latitude" is null or ("place_models"."anchor_latitude" between 40.9 and 43.7 and "place_models"."anchor_longitude" between 39.9 and 46.9));--> statement-breakpoint
ALTER TABLE "place_models" ADD CONSTRAINT "place_models_pitch_check" CHECK ("place_models"."pitch_degrees" between -180 and 180);--> statement-breakpoint
ALTER TABLE "place_models" ADD CONSTRAINT "place_models_roll_check" CHECK ("place_models"."roll_degrees" between -180 and 180);--> statement-breakpoint
ALTER TABLE "place_models" ADD CONSTRAINT "place_models_axis_scale_check" CHECK ("place_models"."scale_x" > 0 and "place_models"."scale_x" <= 100 and "place_models"."scale_y" > 0 and "place_models"."scale_y" <= 100 and "place_models"."scale_z" > 0 and "place_models"."scale_z" <= 100);