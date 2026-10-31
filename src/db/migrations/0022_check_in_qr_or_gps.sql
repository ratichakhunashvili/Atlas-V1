ALTER TABLE "place_visits" DROP CONSTRAINT "place_visits_method_check";--> statement-breakpoint
ALTER TABLE "achievement_unlocks" DROP CONSTRAINT "achievement_unlocks_method_check";--> statement-breakpoint
ALTER TABLE "itinerary_stops" DROP CONSTRAINT "itinerary_stops_check_in_method_check";--> statement-breakpoint
ALTER TABLE "place_visits" ADD CONSTRAINT "place_visits_method_check" CHECK ("place_visits"."first_verification_method" in ('gps', 'qr', 'ar', 'auto', 'qr_or_gps'));--> statement-breakpoint
ALTER TABLE "achievement_unlocks" ADD CONSTRAINT "achievement_unlocks_method_check" CHECK ("achievement_unlocks"."verification_method" in ('gps', 'qr', 'ar', 'auto', 'qr_or_gps'));--> statement-breakpoint
ALTER TABLE "itinerary_stops" ADD CONSTRAINT "itinerary_stops_check_in_method_check" CHECK ("itinerary_stops"."check_in_method" in ('gps', 'qr', 'ar', 'auto', 'qr_or_gps'));