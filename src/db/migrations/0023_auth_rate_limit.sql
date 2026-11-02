CREATE TABLE "auth_rate_limit_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_rate_limit_attempts_scope_check" CHECK ("auth_rate_limit_attempts"."scope" in ('sign_in_email', 'sign_in_ip', 'sign_up_ip'))
);
--> statement-breakpoint
CREATE INDEX "auth_rate_limit_attempts_key_scope_time_idx" ON "auth_rate_limit_attempts" USING btree ("key_hash","scope","occurred_at");