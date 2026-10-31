ALTER TABLE "hotel_stays" ADD COLUMN "expected_check_out" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hotel_stays" ADD COLUMN "dates_source" text DEFAULT 'guest_declared' NOT NULL;--> statement-breakpoint
ALTER TABLE "hotel_stays" ADD CONSTRAINT "hotel_stays_dates_source_check" CHECK ("hotel_stays"."dates_source" in ('guest_declared', 'verified'));--> statement-breakpoint
ALTER TABLE "hotel_stays" ADD CONSTRAINT "hotel_stays_expected_check_out_check" CHECK ("hotel_stays"."expected_check_out" is null or "hotel_stays"."expected_check_out" > "hotel_stays"."check_in");