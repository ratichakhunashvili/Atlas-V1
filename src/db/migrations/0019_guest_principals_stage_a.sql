CREATE TABLE "guest_principals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"linked_at" timestamp with time zone,
	CONSTRAINT "guest_principals_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "guest_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"principal_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"rotated_from" uuid,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "guest_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "hotel_stays" ADD COLUMN "principal_id" uuid;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "principal_id" uuid;--> statement-breakpoint
ALTER TABLE "pending_hotel_switches" ADD COLUMN "principal_id" uuid;--> statement-breakpoint
ALTER TABLE "rate_limit_attempts" ADD COLUMN "principal_id" uuid;--> statement-breakpoint
ALTER TABLE "place_visits" ADD COLUMN "principal_id" uuid;--> statement-breakpoint
ALTER TABLE "achievement_unlocks" ADD COLUMN "principal_id" uuid;--> statement-breakpoint
ALTER TABLE "itinerary_days" ADD COLUMN "principal_id" uuid;--> statement-breakpoint
ALTER TABLE "guest_principals" ADD CONSTRAINT "guest_principals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_principal_id_guest_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."guest_principals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_rotated_from_guest_sessions_id_fk" FOREIGN KEY ("rotated_from") REFERENCES "public"."guest_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guest_sessions_principal_idx" ON "guest_sessions" USING btree ("principal_id");--> statement-breakpoint
ALTER TABLE "hotel_stays" ADD CONSTRAINT "hotel_stays_principal_id_guest_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."guest_principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_principal_id_guest_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."guest_principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_hotel_switches" ADD CONSTRAINT "pending_hotel_switches_principal_id_guest_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."guest_principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_limit_attempts" ADD CONSTRAINT "rate_limit_attempts_principal_id_guest_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."guest_principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_visits" ADD CONSTRAINT "place_visits_principal_id_guest_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."guest_principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_unlocks" ADD CONSTRAINT "achievement_unlocks_principal_id_guest_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."guest_principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_principal_id_guest_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."guest_principals"("id") ON DELETE no action ON UPDATE no action;