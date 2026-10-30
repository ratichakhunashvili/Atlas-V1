-- Purpose-bound, hashed QR credentials.
--
-- Additive and non-destructive: nothing is dropped. The only change to an existing
-- table RELAXES hotels.qr_token NOT NULL so a new hotel needs no raw token. The
-- legacy hotels.qr_token and places.qr_token columns keep their data; no code path
-- reads or writes them any more, and a later migration can remove them.
--
-- Approved decision (2026-10-14): existing raw tokens are ROTATED, not hashed in
-- place. Nothing is copied into qr_credentials, so each hotel and QR Place needs an
-- admin to issue a fresh credential. Safe here because 0002-0005 are unapplied and
-- no codes are in print.

CREATE TABLE "qr_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text NOT NULL,
	"hotel_id" uuid,
	"place_id" uuid,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qr_credentials_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "qr_credentials_purpose_check" CHECK ("qr_credentials"."purpose" in ('hotel_entry', 'place_check_in')),
	CONSTRAINT "qr_credentials_subject_matches_purpose_check" CHECK (("qr_credentials"."purpose" = 'hotel_entry' and "qr_credentials"."hotel_id" is not null and "qr_credentials"."place_id" is null)
          or ("qr_credentials"."purpose" = 'place_check_in' and "qr_credentials"."place_id" is not null and "qr_credentials"."hotel_id" is null))
);
--> statement-breakpoint
ALTER TABLE "hotels" ALTER COLUMN "qr_token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "qr_credentials" ADD CONSTRAINT "qr_credentials_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_credentials" ADD CONSTRAINT "qr_credentials_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "qr_credentials_active_hotel_idx" ON "qr_credentials" USING btree ("hotel_id") WHERE "qr_credentials"."revoked_at" is null and "qr_credentials"."hotel_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "qr_credentials_active_place_idx" ON "qr_credentials" USING btree ("place_id") WHERE "qr_credentials"."revoked_at" is null and "qr_credentials"."place_id" is not null;--> statement-breakpoint
CREATE INDEX "qr_credentials_purpose_idx" ON "qr_credentials" USING btree ("purpose");