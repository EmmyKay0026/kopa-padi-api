CREATE TYPE "public"."account_restriction_type" AS ENUM('MATCHING_DISABLED', 'MESSAGING_DISABLED', 'TRAVEL_PLAN_DISABLED', 'VERIFICATION_REVIEW_REQUIRED', 'ACCOUNT_SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."admin_capability" AS ENUM('safety_reports.read', 'safety_reports.triage', 'moderation_cases.read', 'moderation_cases.manage', 'account_restrictions.read', 'account_restrictions.apply', 'account_restrictions.revoke', 'verification.review', 'messages.review_for_safety', 'audit_logs.read', 'users.suspend', 'trusted_contacts.review_for_safety', 'journey_locations.review_for_safety');--> statement-breakpoint
CREATE TYPE "public"."moderation_note_type" AS ENUM('INTERNAL', 'EVIDENCE', 'DECISION', 'FOLLOW_UP');--> statement-breakpoint
CREATE TYPE "public"."moderation_case_priority" AS ENUM('LOW', 'NORMAL', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."moderation_case_status" AS ENUM('OPEN', 'TRIAGED', 'IN_REVIEW', 'AWAITING_INFORMATION', 'ACTION_REQUIRED', 'RESOLVED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."safety_report_severity" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."safety_report_status_v2" AS ENUM('SUBMITTED', 'TRIAGED', 'UNDER_REVIEW', 'ACTION_TAKEN', 'RESOLVED', 'DISMISSED', 'DUPLICATE');--> statement-breakpoint
CREATE TYPE "public"."restriction_status" AS ENUM('ACTIVE', 'EXPIRED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."safety_report_category_v2" AS ENUM('HARASSMENT', 'MONEY_REQUEST', 'SCAM', 'UNSAFE_MEETUP', 'IDENTITY_CONCERN', 'THREATENING_BEHAVIOUR', 'SPAM', 'STALKING_OR_PROBING', 'IMPERSONATION', 'OTHER');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'VIEWED_PRIVATE_MESSAGE_FOR_SAFETY';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'VIEWED_TRUSTED_CONTACT_DATA';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'VIEWED_PRECISE_JOURNEY_LOCATION';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'SAFETY_REPORT_TRIAGED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'MODERATION_CASE_OPENED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'MODERATION_CASE_ASSIGNED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'MODERATION_NOTE_ADDED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'RESTRICTION_APPLIED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'RESTRICTION_REVOKED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'USER_SUSPENDED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'USER_UNSUSPENDED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'VERIFICATION_REVIEW_REQUESTED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'CASE_RESOLVED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'CASE_DISMISSED';--> statement-breakpoint
CREATE TABLE "account_restriction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"restriction_type" "account_restriction_type" NOT NULL,
	"status" "restriction_status" DEFAULT 'ACTIVE' NOT NULL,
	"reason_code" text NOT NULL,
	"reason_internal" text,
	"applied_by" uuid NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_by" uuid,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "admin_capability_grant" (
	"admin_user_id" uuid NOT NULL,
	"capability" "admin_capability" NOT NULL,
	"granted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_capability_grant_admin_user_id_capability_pk" PRIMARY KEY("admin_user_id","capability")
);
--> statement-breakpoint
CREATE TABLE "moderation_case_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moderation_case_id" uuid NOT NULL,
	"author_admin_id" uuid NOT NULL,
	"noteType" "moderation_note_type" NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_note_body_check" CHECK (char_length("moderation_case_note"."body") between 2 and 4000)
);
--> statement-breakpoint
CREATE TABLE "moderation_case_report" (
	"moderation_case_id" uuid NOT NULL,
	"safety_report_id" uuid NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_case_report_moderation_case_id_safety_report_id_pk" PRIMARY KEY("moderation_case_id","safety_report_id")
);
--> statement-breakpoint
CREATE TABLE "moderation_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"primary_report_id" uuid,
	"subject_user_id" uuid NOT NULL,
	"priority" "moderation_case_priority" DEFAULT 'NORMAL' NOT NULL,
	"status" "moderation_case_status" DEFAULT 'OPEN' NOT NULL,
	"assigned_admin_id" uuid,
	"summary_internal" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "safety_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"reported_user_id" uuid,
	"travel_circle_id" uuid,
	"journey_id" uuid,
	"message_id" uuid,
	"meetup_id" uuid,
	"category" "safety_report_category_v2" NOT NULL,
	"description" text,
	"reported_content_snapshot" text,
	"severity" "safety_report_severity" DEFAULT 'MEDIUM' NOT NULL,
	"status" "safety_report_status_v2" DEFAULT 'SUBMITTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "safety_report_target_check" CHECK ("safety_report"."reported_user_id" IS NOT NULL OR "safety_report"."travel_circle_id" IS NOT NULL OR "safety_report"."journey_id" IS NOT NULL OR "safety_report"."message_id" IS NOT NULL OR "safety_report"."meetup_id" IS NOT NULL),
	CONSTRAINT "safety_report_not_self" CHECK ("safety_report"."reported_user_id" IS NULL OR "safety_report"."reported_user_id"<>"safety_report"."reporter_user_id"),
	CONSTRAINT "safety_report_text_check" CHECK (("safety_report"."description" IS NULL OR char_length("safety_report"."description")<=2000) AND ("safety_report"."reported_content_snapshot" IS NULL OR char_length("safety_report"."reported_content_snapshot")<=4000))
);
--> statement-breakpoint
ALTER TABLE "account_restriction" ADD CONSTRAINT "account_restriction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_restriction" ADD CONSTRAINT "account_restriction_applied_by_user_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_restriction" ADD CONSTRAINT "account_restriction_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_capability_grant" ADD CONSTRAINT "admin_capability_grant_admin_user_id_user_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_capability_grant" ADD CONSTRAINT "admin_capability_grant_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_case_note" ADD CONSTRAINT "moderation_case_note_moderation_case_id_moderation_case_id_fk" FOREIGN KEY ("moderation_case_id") REFERENCES "public"."moderation_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_case_note" ADD CONSTRAINT "moderation_case_note_author_admin_id_user_id_fk" FOREIGN KEY ("author_admin_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_case_report" ADD CONSTRAINT "moderation_case_report_moderation_case_id_moderation_case_id_fk" FOREIGN KEY ("moderation_case_id") REFERENCES "public"."moderation_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_case_report" ADD CONSTRAINT "moderation_case_report_safety_report_id_safety_report_id_fk" FOREIGN KEY ("safety_report_id") REFERENCES "public"."safety_report"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_case" ADD CONSTRAINT "moderation_case_primary_report_id_safety_report_id_fk" FOREIGN KEY ("primary_report_id") REFERENCES "public"."safety_report"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_case" ADD CONSTRAINT "moderation_case_subject_user_id_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_case" ADD CONSTRAINT "moderation_case_assigned_admin_id_user_id_fk" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_report" ADD CONSTRAINT "safety_report_reporter_user_id_user_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_report" ADD CONSTRAINT "safety_report_reported_user_id_user_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_report" ADD CONSTRAINT "safety_report_travel_circle_id_travel_circle_id_fk" FOREIGN KEY ("travel_circle_id") REFERENCES "public"."travel_circle"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_report" ADD CONSTRAINT "safety_report_journey_id_journey_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journey"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_report" ADD CONSTRAINT "safety_report_message_id_circle_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."circle_message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_report" ADD CONSTRAINT "safety_report_meetup_id_circle_meetup_id_fk" FOREIGN KEY ("meetup_id") REFERENCES "public"."circle_meetup"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_restriction_type_uq" ON "account_restriction" USING btree ("user_id","restriction_type") WHERE "account_restriction"."status"='ACTIVE';--> statement-breakpoint
CREATE INDEX "restriction_user_status_type_idx" ON "account_restriction" USING btree ("user_id","status","restriction_type");--> statement-breakpoint
CREATE INDEX "restriction_expiry_idx" ON "account_restriction" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "moderation_note_case_idx" ON "moderation_case_note" USING btree ("moderation_case_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "report_one_case_uq" ON "moderation_case_report" USING btree ("safety_report_id");--> statement-breakpoint
CREATE INDEX "moderation_case_subject_status_idx" ON "moderation_case" USING btree ("subject_user_id","status");--> statement-breakpoint
CREATE INDEX "moderation_case_queue_idx" ON "moderation_case" USING btree ("priority","status","opened_at");--> statement-breakpoint
CREATE INDEX "safety_report_subject_status_idx" ON "safety_report" USING btree ("reported_user_id","status");--> statement-breakpoint
CREATE INDEX "safety_report_queue_idx" ON "safety_report" USING btree ("status","severity","created_at");