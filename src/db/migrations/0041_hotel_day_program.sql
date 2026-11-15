CREATE TABLE "hotel_day_program_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"place_ids" uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotel_day_program_steps_position_check" CHECK ("hotel_day_program_steps"."position" between 1 and 4),
	CONSTRAINT "hotel_day_program_steps_places_check" CHECK (cardinality("hotel_day_program_steps"."place_ids") between 1 and 3)
);
--> statement-breakpoint
ALTER TABLE "hotel_day_program_steps" ADD CONSTRAINT "hotel_day_program_steps_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_day_program_steps_hotel_position_idx" ON "hotel_day_program_steps" USING btree ("hotel_id","position");