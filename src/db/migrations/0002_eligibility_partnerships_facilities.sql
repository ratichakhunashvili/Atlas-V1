CREATE TABLE "hotel_partnerships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"priority" integer,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotel_partnerships_status_check" CHECK ("hotel_partnerships"."status" in ('pending_review', 'active', 'suspended', 'revoked')),
	CONSTRAINT "hotel_partnerships_active_requires_confirmation_check" CHECK ("hotel_partnerships"."status" <> 'active' or "hotel_partnerships"."confirmed_at" is not null),
	CONSTRAINT "hotel_partnerships_window_check" CHECK ("hotel_partnerships"."starts_at" is null or "hotel_partnerships"."ends_at" is null or "hotel_partnerships"."ends_at" > "hotel_partnerships"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "hotel_facilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"facility_type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotel_facilities_type_check" CHECK ("hotel_facilities"."facility_type" in ('pool', 'spa', 'sauna', 'gym', 'dining', 'room_service', 'event', 'other')),
	CONSTRAINT "hotel_facilities_status_check" CHECK ("hotel_facilities"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hotel_partnerships" ADD CONSTRAINT "hotel_partnerships_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_partnerships" ADD CONSTRAINT "hotel_partnerships_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_partnerships" ADD CONSTRAINT "hotel_partnerships_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_facilities" ADD CONSTRAINT "hotel_facilities_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_facilities" ADD CONSTRAINT "hotel_facilities_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_partnerships_hotel_place_idx" ON "hotel_partnerships" USING btree ("hotel_id","place_id");--> statement-breakpoint
CREATE INDEX "hotel_partnerships_hotel_status_idx" ON "hotel_partnerships" USING btree ("hotel_id","status");--> statement-breakpoint
CREATE INDEX "hotel_partnerships_place_idx" ON "hotel_partnerships" USING btree ("place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_facilities_place_idx" ON "hotel_facilities" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "hotel_facilities_hotel_status_idx" ON "hotel_facilities" USING btree ("hotel_id","status");
--> statement-breakpoint
-- Data copy (additive, non-destructive): preserve every legacy hotel_places
-- relationship as a partnership that is NOT yet eligible. status stays
-- 'pending_review' (no confirmed_at / confirmed_by), so an authorized admin must
-- explicitly confirm each one before any guest can be shown it. hotel_places is
-- left completely untouched. Re-running is a no-op (ON CONFLICT DO NOTHING).
INSERT INTO "hotel_partnerships" ("hotel_id", "place_id", "status", "priority", "created_at", "updated_at")
SELECT "hotel_id", "place_id", 'pending_review', "priority", "created_at", now()
FROM "hotel_places"
ON CONFLICT ("hotel_id", "place_id") DO NOTHING;
