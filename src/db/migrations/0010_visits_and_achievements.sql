CREATE TABLE "place_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"first_visited_at" timestamp with time zone NOT NULL,
	"last_visited_at" timestamp with time zone NOT NULL,
	"visit_count" integer DEFAULT 1 NOT NULL,
	"first_verification_method" text NOT NULL,
	CONSTRAINT "place_visits_user_place_unique" UNIQUE("user_id","place_id"),
	CONSTRAINT "place_visits_count_positive_check" CHECK ("place_visits"."visit_count" >= 1),
	CONSTRAINT "place_visits_order_check" CHECK ("place_visits"."last_visited_at" >= "place_visits"."first_visited_at"),
	CONSTRAINT "place_visits_method_check" CHECK ("place_visits"."first_verification_method" in ('gps', 'qr', 'auto'))
);
--> statement-breakpoint
CREATE TABLE "achievement_unlocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"achievement_id" uuid NOT NULL,
	"place_visit_id" uuid NOT NULL,
	"verification_method" text NOT NULL,
	"unlocked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "achievement_unlocks_user_achievement_unique" UNIQUE("user_id","achievement_id"),
	CONSTRAINT "achievement_unlocks_method_check" CHECK ("achievement_unlocks"."verification_method" in ('gps', 'qr', 'auto'))
);
--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"badge_image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_place_unique" UNIQUE("place_id"),
	CONSTRAINT "achievements_name_not_blank_check" CHECK (length(trim("achievements"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "place_visits" ADD CONSTRAINT "place_visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_visits" ADD CONSTRAINT "place_visits_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_unlocks" ADD CONSTRAINT "achievement_unlocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_unlocks" ADD CONSTRAINT "achievement_unlocks_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_unlocks" ADD CONSTRAINT "achievement_unlocks_place_visit_id_place_visits_id_fk" FOREIGN KEY ("place_visit_id") REFERENCES "public"."place_visits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "place_visits_user_idx" ON "place_visits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "achievement_unlocks_user_idx" ON "achievement_unlocks" USING btree ("user_id");