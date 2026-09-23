CREATE TYPE "public"."account_status" AS ENUM('ACTIVE', 'RESTRICTED', 'SUSPENDED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('VIEWED_VERIFICATION_DOCUMENT', 'STARTED_VERIFICATION_REVIEW', 'APPROVED_PCM_VERIFICATION', 'REJECTED_PCM_VERIFICATION', 'REQUESTED_PCM_RESUBMISSION', 'REVOKED_PCM_VERIFICATION');--> statement-breakpoint
CREATE TYPE "public"."orientation_camp_status" AS ENUM('ACTIVE', 'INACTIVE', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."verification_document_status" AS ENUM('ACTIVE', 'SUPERSEDED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."verification_document_type" AS ENUM('CALLUP_LETTER', 'IDENTITY_DOCUMENT', 'SELFIE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."nysc_intake_status" AS ENUM('UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."verification_rejection_reason" AS ENUM('DOCUMENT_UNREADABLE', 'DOCUMENT_INCOMPLETE', 'POSTING_INFORMATION_MISMATCH', 'UNABLE_TO_VERIFY', 'DUPLICATE_OR_SUSPICIOUS_SUBMISSION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."pcm_verification_status" AS ENUM('UNVERIFIED', 'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'RESUBMISSION_REQUIRED', 'REVOKED');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" "audit_action" NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" text DEFAULT '0' NOT NULL,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nysc_intake" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_year" text NOT NULL,
	"batch" text NOT NULL,
	"stream" text NOT NULL,
	"orientation_start_date" date,
	"orientation_end_date" date,
	"status" "nysc_intake_status" DEFAULT 'UPCOMING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orientation_camp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_name" text NOT NULL,
	"camp_name" text NOT NULL,
	"official_address" text,
	"lga_name" text,
	"status" "orientation_camp_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pcm_profile" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name_private" text NOT NULL,
	"display_name" text NOT NULL,
	"profile_photo_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pcm_verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"nysc_intake_id" uuid NOT NULL,
	"orientation_camp_id" uuid NOT NULL,
	"verification_status" "pcm_verification_status" DEFAULT 'UNVERIFIED' NOT NULL,
	"verification_method" text DEFAULT 'MANUAL_DOCUMENT_REVIEW' NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"reviewed_by" uuid,
	"rejection_reason_code" "verification_rejection_reason",
	"user_safe_reason" text,
	"review_notes_private" text,
	"version" text DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verified_fields_check" CHECK ("pcm_verification"."verification_status" <> 'VERIFIED' OR ("pcm_verification"."verified_at" IS NOT NULL AND "pcm_verification"."reviewed_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"account_status" "account_status" DEFAULT 'ACTIVE' NOT NULL,
	"role" "user_role" DEFAULT 'USER' NOT NULL,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verification_id" uuid NOT NULL,
	"document_type" "verification_document_type" NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" text NOT NULL,
	"sha256" text NOT NULL,
	"status" "verification_document_status" DEFAULT 'ACTIVE' NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "verification_document_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pcm_profile" ADD CONSTRAINT "pcm_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pcm_verification" ADD CONSTRAINT "pcm_verification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pcm_verification" ADD CONSTRAINT "pcm_verification_nysc_intake_id_nysc_intake_id_fk" FOREIGN KEY ("nysc_intake_id") REFERENCES "public"."nysc_intake"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pcm_verification" ADD CONSTRAINT "pcm_verification_orientation_camp_id_orientation_camp_id_fk" FOREIGN KEY ("orientation_camp_id") REFERENCES "public"."orientation_camp"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pcm_verification" ADD CONSTRAINT "pcm_verification_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_document" ADD CONSTRAINT "verification_document_verification_id_pcm_verification_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."pcm_verification"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_uq" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_resource_idx" ON "audit_log" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "auth_verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "nysc_intake_identity_uq" ON "nysc_intake" USING btree ("service_year","batch","stream");--> statement-breakpoint
CREATE UNIQUE INDEX "orientation_camp_name_uq" ON "orientation_camp" USING btree ("state_name","camp_name");--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_verification_per_user" ON "pcm_verification" USING btree ("user_id") WHERE "pcm_verification"."verification_status" in ('UNVERIFIED','SUBMITTED','UNDER_REVIEW','RESUBMISSION_REQUIRED');--> statement-breakpoint
CREATE INDEX "verification_queue_idx" ON "pcm_verification" USING btree ("verification_status","submitted_at");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "document_verification_idx" ON "verification_document" USING btree ("verification_id");