ALTER TABLE "plan_day_feedback" ALTER COLUMN "overall_rating" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_day_feedback" ADD COLUMN "topic" text;--> statement-breakpoint
ALTER TABLE "plan_day_feedback" ADD COLUMN "comment" text;--> statement-breakpoint
ALTER TABLE "plan_day_feedback" ADD CONSTRAINT "plan_day_feedback_topic_check" CHECK ("plan_day_feedback"."topic" in ('technical', 'map', 'places', 'checkin', 'money', 'hotel', 'other'));--> statement-breakpoint
ALTER TABLE "plan_day_feedback" ADD CONSTRAINT "plan_day_feedback_comment_check" CHECK (char_length("plan_day_feedback"."comment") between 1 and 1000);--> statement-breakpoint
ALTER TABLE "plan_day_feedback" ADD CONSTRAINT "plan_day_feedback_answer_check" CHECK (("plan_day_feedback"."topic" is not null and "plan_day_feedback"."comment" is not null) or "plan_day_feedback"."overall_rating" is not null);