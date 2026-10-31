-- Time-aware Advisor: how long a stop takes, how much free time the guest had,
-- and real scheduled hotel events.
--
-- Entirely additive: three nullable columns and one new table. No existing row
-- changes, and a plan generated before this migration keeps null for the new
-- columns, which the Advisor reads as "not configured" — never as zero.

CREATE TABLE "hotel_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"venue_place_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotel_events_status_check" CHECK ("hotel_events"."status" in ('scheduled', 'cancelled')),
	CONSTRAINT "hotel_events_ends_after_starts_check" CHECK ("hotel_events"."ends_at" > "hotel_events"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "visit_duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "itinerary_days" ADD COLUMN "available_minutes" integer;--> statement-breakpoint
ALTER TABLE "itinerary_stops" ADD COLUMN "visit_duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "hotel_events" ADD CONSTRAINT "hotel_events_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_events" ADD CONSTRAINT "hotel_events_venue_place_id_places_id_fk" FOREIGN KEY ("venue_place_id") REFERENCES "public"."places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hotel_events_hotel_starts_idx" ON "hotel_events" USING btree ("hotel_id","starts_at");--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_visit_duration_check" CHECK ("places"."visit_duration_minutes" is null or ("places"."visit_duration_minutes" > 0 and "places"."visit_duration_minutes" <= 1440));