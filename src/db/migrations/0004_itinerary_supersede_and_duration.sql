ALTER TABLE "itinerary_days" ADD COLUMN "original_duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "itinerary_stops" ADD COLUMN "superseded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "itinerary_stops" ADD COLUMN "superseded_reason" text;--> statement-breakpoint
ALTER TABLE "itinerary_stops" ADD CONSTRAINT "itinerary_stops_completed_never_superseded_check" CHECK ("itinerary_stops"."superseded_at" is null or "itinerary_stops"."visited_at" is null);--> statement-breakpoint
ALTER TABLE "itinerary_stops" ADD CONSTRAINT "itinerary_stops_superseded_pair_check" CHECK (("itinerary_stops"."superseded_at" is null) = ("itinerary_stops"."superseded_reason" is null));--> statement-breakpoint
ALTER TABLE "itinerary_stops" ADD CONSTRAINT "itinerary_stops_superseded_reason_check" CHECK ("itinerary_stops"."superseded_reason" is null or "itinerary_stops"."superseded_reason" in ('stop_unavailable', 'plan_regenerated', 'removed_unavailable'));