-- Narrow, database-backed rate limiting for the four approved scopes.
--
-- Additive: one new table, nothing else changes. Rows record that an attempt
-- happened, keyed to the AUTHENTICATED actor — never a client IP, which a whole
-- hotel shares. No token, hash, coordinate or stop id is stored here.

CREATE TABLE "rate_limit_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_limit_attempts_scope_check" CHECK ("rate_limit_attempts"."scope" in ('place_check_in', 'hotel_entry', 'qr_credential_issue'))
);
--> statement-breakpoint
ALTER TABLE "rate_limit_attempts" ADD CONSTRAINT "rate_limit_attempts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rate_limit_attempts_actor_scope_time_idx" ON "rate_limit_attempts" USING btree ("actor_id","scope","occurred_at");