CREATE TABLE "admin_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"hotel_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_audit_events_action_check" CHECK ("admin_audit_events"."action" in ('partnership.proposed', 'partnership.confirmed', 'partnership.suspended', 'partnership.revoked', 'partnership.reopened', 'place.created', 'place.published', 'place.unpublished', 'place.verified', 'place.unverified', 'place.archived', 'place.unarchived', 'place.deleted', 'qr_credential.issued', 'qr_credential.rotated', 'qr_credential.revoked', 'model.saved', 'model.enabled', 'model.disabled', 'model.deleted', 'staff.role_changed', 'support.guest_lookup')),
	CONSTRAINT "admin_audit_events_reason_length_check" CHECK ("admin_audit_events"."reason" is null or char_length("admin_audit_events"."reason") <= 500)
);
--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_events_occurred_idx" ON "admin_audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "admin_audit_events_target_idx" ON "admin_audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "admin_audit_events_hotel_idx" ON "admin_audit_events" USING btree ("hotel_id","occurred_at");--> statement-breakpoint
-- Append-only. An audit row an admin could edit or delete is not an audit row, so the database refuses both.
-- The single permitted change is the one the foreign key itself makes: ON DELETE SET NULL on actor_user_id when an
-- account is deleted (history outlives the person; nothing else about the row may move).
CREATE FUNCTION "admin_audit_events_guard"() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'admin_audit_events is append-only' USING ERRCODE = '42501';
	END IF;
	IF NEW.actor_user_id IS NOT NULL
		OR (to_jsonb(NEW) - 'actor_user_id') IS DISTINCT FROM (to_jsonb(OLD) - 'actor_user_id') THEN
		RAISE EXCEPTION 'admin_audit_events is append-only' USING ERRCODE = '42501';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "admin_audit_events_append_only" BEFORE UPDATE OR DELETE ON "admin_audit_events"
	FOR EACH ROW EXECUTE FUNCTION "admin_audit_events_guard"();
