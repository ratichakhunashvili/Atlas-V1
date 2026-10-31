ALTER TABLE "places" ADD COLUMN "publication_status" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "verification_status" text DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_publication_status_check" CHECK ("places"."publication_status" in ('draft', 'published'));--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_verification_status_check" CHECK ("places"."verification_status" in ('unverified', 'verified'));--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_published_requires_date_check" CHECK ("places"."publication_status" <> 'published' or "places"."published_at" is not null);--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_verified_requires_date_check" CHECK ("places"."verification_status" <> 'verified' or "places"."verified_at" is not null);--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_archived_not_published_check" CHECK ("places"."archived_at" is null or "places"."publication_status" <> 'published');