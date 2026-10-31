ALTER TABLE "places" ADD COLUMN "price_level_source" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "price_level_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_price_level_evidence_check" CHECK ("places"."price_level" is null or ("places"."price_level_source" is not null and "places"."price_level_verified_at" is not null));