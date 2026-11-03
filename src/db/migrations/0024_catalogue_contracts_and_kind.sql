CREATE TABLE "atlas_partner_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "atlas_partner_contracts_status_check" CHECK ("atlas_partner_contracts"."status" in ('pending_review', 'active', 'suspended', 'ended')),
	CONSTRAINT "atlas_partner_contracts_active_requires_confirmation_check" CHECK ("atlas_partner_contracts"."status" <> 'active' or "atlas_partner_contracts"."confirmed_at" is not null),
	CONSTRAINT "atlas_partner_contracts_ended_requires_date_check" CHECK ("atlas_partner_contracts"."status" <> 'ended' or "atlas_partner_contracts"."ended_at" is not null),
	CONSTRAINT "atlas_partner_contracts_window_check" CHECK ("atlas_partner_contracts"."starts_at" is null or "atlas_partner_contracts"."ends_at" is null or "atlas_partner_contracts"."ends_at" > "atlas_partner_contracts"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "admin_audit_events" DROP CONSTRAINT "admin_audit_events_action_check";--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "kind" text DEFAULT 'business' NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "kind_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "atlas_partner_contracts" ADD CONSTRAINT "atlas_partner_contracts_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_partner_contracts" ADD CONSTRAINT "atlas_partner_contracts_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atlas_partner_contracts_place_idx" ON "atlas_partner_contracts" USING btree ("place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "atlas_partner_contracts_one_active_idx" ON "atlas_partner_contracts" USING btree ("place_id") WHERE "atlas_partner_contracts"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "atlas_partner_contracts_one_pending_idx" ON "atlas_partner_contracts" USING btree ("place_id") WHERE "atlas_partner_contracts"."status" = 'pending_review';--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_kind_check" CHECK ("places"."kind" in ('business', 'attraction', 'hotel'));--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_action_check" CHECK ("admin_audit_events"."action" in ('partnership.proposed', 'partnership.confirmed', 'partnership.suspended', 'partnership.revoked', 'partnership.reopened', 'partnership.promotion_changed', 'contract.proposed', 'contract.confirmed', 'contract.suspended', 'contract.ended', 'contract.reopened', 'place.kind_changed', 'place.created', 'place.published', 'place.unpublished', 'place.verified', 'place.unverified', 'place.archived', 'place.unarchived', 'place.deleted', 'qr_credential.issued', 'qr_credential.rotated', 'qr_credential.revoked', 'model.saved', 'model.enabled', 'model.disabled', 'model.deleted', 'staff.role_changed', 'support.guest_lookup'));--> statement-breakpoint
-- Backfill (docs/catalogue-model-plan.md section 6 and decisions 1 and 3). Guest eligibility does not read any of this yet.
-- A hotel's anchor Place is certainly a hotel, so that kind is recorded as confirmed.
UPDATE "places" SET "kind" = 'hotel', "kind_confirmed_at" = now() WHERE "id" IN (SELECT "place_id" FROM "hotels");--> statement-breakpoint
-- A Place merely CATEGORISED as a hotel is only a suggestion until an admin confirms it.
UPDATE "places" SET "kind" = 'hotel' WHERE "category" = 'hotel' AND "kind_confirmed_at" IS NULL;--> statement-breakpoint
-- Attraction-like categories are SUGGESTED as attractions (kind_confirmed_at stays null), unless the Place already
-- has commercial history (a hotel partnership) or is a hotel's own facility.
UPDATE "places" SET "kind" = 'attraction'
WHERE "category" IN ('landmark', 'historical', 'nature', 'beach', 'attraction')
  AND "kind_confirmed_at" IS NULL
  AND "id" NOT IN (SELECT "place_id" FROM "hotel_partnerships")
  AND "id" NOT IN (SELECT "place_id" FROM "hotel_facilities");--> statement-breakpoint
-- Every business that has a hotel partnership today gets a contract in pending_review: nothing becomes visible
-- until an admin explicitly confirms it.
INSERT INTO "atlas_partner_contracts" ("place_id", "status")
SELECT DISTINCT hp."place_id", 'pending_review'
FROM "hotel_partnerships" hp
JOIN "places" p ON p."id" = hp."place_id"
WHERE p."kind" = 'business'
  AND hp."place_id" NOT IN (SELECT "place_id" FROM "hotel_facilities");
