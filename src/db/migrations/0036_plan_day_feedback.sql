CREATE TABLE "plan_day_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"itinerary_day_id" uuid NOT NULL,
	"hotel_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"overall_rating" smallint NOT NULL,
	"overall_note" text,
	"technical_rating" smallint,
	"technical_note" text,
	"map_rating" smallint,
	"map_note" text,
	"places_rating" smallint,
	"places_note" text,
	"checkin_rating" smallint,
	"checkin_note" text,
	"money_rating" smallint,
	"money_note" text,
	"hotel_rating" smallint,
	"hotel_note" text,
	CONSTRAINT "plan_day_feedback_overall_rating_check" CHECK ("plan_day_feedback"."overall_rating" between 1 and 5),
	CONSTRAINT "plan_day_feedback_technical_rating_check" CHECK ("plan_day_feedback"."technical_rating" between 1 and 5),
	CONSTRAINT "plan_day_feedback_map_rating_check" CHECK ("plan_day_feedback"."map_rating" between 1 and 5),
	CONSTRAINT "plan_day_feedback_places_rating_check" CHECK ("plan_day_feedback"."places_rating" between 1 and 5),
	CONSTRAINT "plan_day_feedback_checkin_rating_check" CHECK ("plan_day_feedback"."checkin_rating" between 1 and 5),
	CONSTRAINT "plan_day_feedback_money_rating_check" CHECK ("plan_day_feedback"."money_rating" between 1 and 5),
	CONSTRAINT "plan_day_feedback_hotel_rating_check" CHECK ("plan_day_feedback"."hotel_rating" between 1 and 5),
	CONSTRAINT "plan_day_feedback_overall_note_check" CHECK (char_length("plan_day_feedback"."overall_note") <= 1000),
	CONSTRAINT "plan_day_feedback_technical_note_check" CHECK (char_length("plan_day_feedback"."technical_note") <= 1000),
	CONSTRAINT "plan_day_feedback_map_note_check" CHECK (char_length("plan_day_feedback"."map_note") <= 1000),
	CONSTRAINT "plan_day_feedback_places_note_check" CHECK (char_length("plan_day_feedback"."places_note") <= 1000),
	CONSTRAINT "plan_day_feedback_checkin_note_check" CHECK (char_length("plan_day_feedback"."checkin_note") <= 1000),
	CONSTRAINT "plan_day_feedback_money_note_check" CHECK (char_length("plan_day_feedback"."money_note") <= 1000),
	CONSTRAINT "plan_day_feedback_hotel_note_check" CHECK (char_length("plan_day_feedback"."hotel_note") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "plan_day_feedback" ADD CONSTRAINT "plan_day_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_day_feedback" ADD CONSTRAINT "plan_day_feedback_itinerary_day_id_itinerary_days_id_fk" FOREIGN KEY ("itinerary_day_id") REFERENCES "public"."itinerary_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_day_feedback" ADD CONSTRAINT "plan_day_feedback_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_day_feedback_day_unique" ON "plan_day_feedback" USING btree ("itinerary_day_id");--> statement-breakpoint
CREATE INDEX "plan_day_feedback_hotel_created_idx" ON "plan_day_feedback" USING btree ("hotel_id","created_at");--> statement-breakpoint
CREATE INDEX "plan_day_feedback_user_idx" ON "plan_day_feedback" USING btree ("user_id");--> statement-breakpoint
-- Only new days ask for feedback (owner decision, 2026-11-13): every day that exists now gets false, then the default
-- becomes true for every day created from here on.
ALTER TABLE "itinerary_days" ADD COLUMN "feedback_requested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "itinerary_days" ALTER COLUMN "feedback_requested" SET DEFAULT true;