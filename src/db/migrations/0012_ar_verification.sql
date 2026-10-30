-- AR verification: a reference hash per Place, and "ar" as a check-in method.
--
-- Additive and widening only. The three method CHECKs are rebuilt to ACCEPT one
-- more value; every existing row stays valid, and nothing is dropped or rewritten.
--
-- place_ar_targets stores a 240-bit difference hash and no image of any kind —
-- not the reference photo, not a guest capture, not a thumbnail.

CREATE TABLE "place_ar_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"target_hash" text NOT NULL,
	"description" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_ar_targets_place_unique" UNIQUE("place_id"),
	CONSTRAINT "place_ar_targets_hash_format_check" CHECK ("place_ar_targets"."target_hash" ~ '^[0-9a-f]{60}$')
);
--> statement-breakpoint
ALTER TABLE "place_visits" DROP CONSTRAINT "place_visits_method_check";--> statement-breakpoint
ALTER TABLE "achievement_unlocks" DROP CONSTRAINT "achievement_unlocks_method_check";--> statement-breakpoint
ALTER TABLE "itinerary_stops" DROP CONSTRAINT "itinerary_stops_check_in_method_check";--> statement-breakpoint
ALTER TABLE "place_ar_targets" ADD CONSTRAINT "place_ar_targets_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_visits" ADD CONSTRAINT "place_visits_method_check" CHECK ("place_visits"."first_verification_method" in ('gps', 'qr', 'ar', 'auto'));--> statement-breakpoint
ALTER TABLE "achievement_unlocks" ADD CONSTRAINT "achievement_unlocks_method_check" CHECK ("achievement_unlocks"."verification_method" in ('gps', 'qr', 'ar', 'auto'));--> statement-breakpoint
ALTER TABLE "itinerary_stops" ADD CONSTRAINT "itinerary_stops_check_in_method_check" CHECK ("itinerary_stops"."check_in_method" in ('gps', 'qr', 'ar', 'auto'));