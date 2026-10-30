ALTER TABLE "places" ADD COLUMN "price_level" integer;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "max_distance_meters" integer;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_price_level_check" CHECK ("places"."price_level" is null or "places"."price_level" between 1 and 3);--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_max_distance_check" CHECK ("user_preferences"."max_distance_meters" is null or ("user_preferences"."max_distance_meters" >= 250 and "user_preferences"."max_distance_meters" <= 5000));