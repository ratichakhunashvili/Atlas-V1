CREATE TABLE "hotel_places" (
	"hotel_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"priority" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotel_places_hotel_id_place_id_pk" PRIMARY KEY("hotel_id","place_id")
);
--> statement-breakpoint
CREATE TABLE "itinerary_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"hotel_id" uuid NOT NULL,
	"hotel_stay_id" uuid,
	"day_number" integer NOT NULL,
	"stop_count" integer NOT NULL,
	"route_geo_json" jsonb,
	"total_duration_seconds" integer,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "itinerary_days_user_id_hotel_id_day_number_unique" UNIQUE("user_id","hotel_id","day_number")
);
--> statement-breakpoint
CREATE TABLE "itinerary_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_id" uuid NOT NULL,
	"place_id" uuid,
	"is_hotel_stop" boolean DEFAULT false NOT NULL,
	"check_in_method" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"image_url" text,
	"position" integer NOT NULL,
	"visited_at" timestamp with time zone,
	CONSTRAINT "itinerary_stops_check_in_method_check" CHECK ("itinerary_stops"."check_in_method" in ('gps', 'qr', 'auto')),
	CONSTRAINT "itinerary_stops_category_check" CHECK ("itinerary_stops"."category" is null or "itinerary_stops"."category" in ('restaurant', 'spa', 'tour', 'shop', 'landmark', 'historical', 'nature', 'museum', 'beach', 'nightlife', 'attraction', 'activity', 'hotel', 'other'))
);
--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "qr_token" text;--> statement-breakpoint
ALTER TABLE "hotel_places" ADD CONSTRAINT "hotel_places_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_places" ADD CONSTRAINT "hotel_places_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_hotel_stay_id_hotel_stays_id_fk" FOREIGN KEY ("hotel_stay_id") REFERENCES "public"."hotel_stays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_stops" ADD CONSTRAINT "itinerary_stops_day_id_itinerary_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."itinerary_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_stops" ADD CONSTRAINT "itinerary_stops_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hotel_places_place_idx" ON "hotel_places" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "itinerary_stops_day_position_idx" ON "itinerary_stops" USING btree ("day_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_stays_active_user_idx" ON "hotel_stays" USING btree ("user_id") WHERE "hotel_stays"."check_out" is null;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_qr_token_unique" UNIQUE("qr_token");