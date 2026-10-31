-- The server-side record of "this guest scanned that hotel's entry code and has
-- been asked to confirm a switch". Additive; nothing else changes.
--
-- It replaces carrying the scanned token through the confirmation step: the
-- credential is verified once, when this row is written, and the confirm action
-- then reads the hotel from here by authenticated user id. No hotel id or token
-- from a browser can select the hotel.

CREATE TABLE "pending_hotel_switches" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"hotel_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pending_hotel_switches" ADD CONSTRAINT "pending_hotel_switches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_hotel_switches" ADD CONSTRAINT "pending_hotel_switches_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;