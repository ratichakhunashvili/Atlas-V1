CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('user', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"category" text NOT NULL,
	"address" text,
	"image_url" text,
	"website" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "places_category_check" CHECK ("places"."category" in ('restaurant', 'spa', 'tour', 'shop', 'landmark', 'historical', 'nature', 'museum', 'beach', 'nightlife', 'attraction', 'activity', 'hotel', 'other'))
);
--> statement-breakpoint
CREATE TABLE "hotels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"qr_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotels_place_id_unique" UNIQUE("place_id"),
	CONSTRAINT "hotels_qr_token_unique" UNIQUE("qr_token")
);
--> statement-breakpoint
CREATE TABLE "hotel_stays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"hotel_id" uuid NOT NULL,
	"check_in" timestamp with time zone NOT NULL,
	"check_out" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"budget" text,
	"activity_level" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_budget_check" CHECK ("user_preferences"."budget" is null or "user_preferences"."budget" in ('budget', 'moderate', 'luxury')),
	CONSTRAINT "user_preferences_activity_level_check" CHECK ("user_preferences"."activity_level" is null or "user_preferences"."activity_level" in ('low', 'moderate', 'high'))
);
--> statement-breakpoint
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_stays" ADD CONSTRAINT "hotel_stays_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_stays" ADD CONSTRAINT "hotel_stays_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "places_category_idx" ON "places" USING btree ("category");--> statement-breakpoint
CREATE INDEX "places_coordinates_idx" ON "places" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "hotel_stays_user_idx" ON "hotel_stays" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "hotel_stays_hotel_idx" ON "hotel_stays" USING btree ("hotel_id");