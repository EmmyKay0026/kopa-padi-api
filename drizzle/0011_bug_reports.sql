CREATE TABLE "bug_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bug_report_status_check" CHECK ("bug_report"."status" IN ('OPEN','RESOLVED')),
	CONSTRAINT "bug_report_text_check" CHECK (char_length("bug_report"."title") BETWEEN 5 AND 160 AND char_length("bug_report"."description") BETWEEN 10 AND 4000)
);
--> statement-breakpoint
ALTER TABLE "bug_report" ADD CONSTRAINT "bug_report_reporter_user_id_user_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bug_report_created_idx" ON "bug_report" USING btree ("created_at");