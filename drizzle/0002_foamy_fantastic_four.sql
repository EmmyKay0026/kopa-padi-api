CREATE TYPE "public"."travel_plan_cancellation_reason" AS ENUM('TRAVEL_NO_LONGER_NEEDED', 'TRAVEL_DATE_CHANGED', 'TRANSPORT_CHANGED', 'CREATED_BY_MISTAKE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."departure_window" AS ENUM('EARLY_MORNING', 'MORNING', 'LATE_MORNING', 'AFTERNOON', 'FLEXIBLE');--> statement-breakpoint
CREATE TYPE "public"."group_preference" AS ENUM('ANY_VERIFIED_PCM');--> statement-breakpoint
CREATE TYPE "public"."transport_mode" AS ENUM('COMMERCIAL_BUS', 'TRAIN', 'FLIGHT', 'PRIVATE_VEHICLE', 'UNDECIDED');--> statement-breakpoint
CREATE TYPE "public"."travel_plan_status" AS ENUM('DRAFT', 'SEARCHING', 'MATCHED', 'IN_CIRCLE', 'LOCKED', 'IN_JOURNEY', 'COMPLETED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'TRAVEL_PLAN_CREATED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'TRAVEL_PLAN_UPDATED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'TRAVEL_PLAN_CANCELLED';--> statement-breakpoint
CREATE TABLE "domain_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "travel_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pcm_verification_id" uuid NOT NULL,
	"origin_state_id" text NOT NULL,
	"origin_lga_id" text NOT NULL,
	"origin_town_id" uuid,
	"destination_camp_id" uuid NOT NULL,
	"intended_travel_date" date NOT NULL,
	"date_flexibility_days" integer DEFAULT 0 NOT NULL,
	"departure_window" "departure_window" NOT NULL,
	"transport_mode" "transport_mode" NOT NULL,
	"transport_flexible" boolean DEFAULT false NOT NULL,
	"nearby_matching_enabled" boolean DEFAULT true NOT NULL,
	"group_preference" "group_preference" DEFAULT 'ANY_VERIFIED_PCM' NOT NULL,
	"status" "travel_plan_status" DEFAULT 'SEARCHING' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" "travel_plan_cancellation_reason",
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "travel_plan_flexibility_check" CHECK ("travel_plan"."date_flexibility_days" in (0,1,2)),
	CONSTRAINT "travel_plan_cancelled_timestamp_check" CHECK ("travel_plan"."status" <> 'CANCELLED' OR "travel_plan"."cancelled_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "travel_plan" ADD CONSTRAINT "travel_plan_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_plan" ADD CONSTRAINT "travel_plan_pcm_verification_id_pcm_verification_id_fk" FOREIGN KEY ("pcm_verification_id") REFERENCES "public"."pcm_verification"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_plan" ADD CONSTRAINT "travel_plan_origin_state_id_state_id_fk" FOREIGN KEY ("origin_state_id") REFERENCES "public"."state"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_plan" ADD CONSTRAINT "travel_plan_origin_lga_id_lga_id_fk" FOREIGN KEY ("origin_lga_id") REFERENCES "public"."lga"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_plan" ADD CONSTRAINT "travel_plan_origin_town_id_town_id_fk" FOREIGN KEY ("origin_town_id") REFERENCES "public"."town"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_plan" ADD CONSTRAINT "travel_plan_destination_camp_id_orientation_camp_id_fk" FOREIGN KEY ("destination_camp_id") REFERENCES "public"."orientation_camp"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domain_outbox_pending_idx" ON "domain_outbox" USING btree ("processed_at","available_at");--> statement-breakpoint
CREATE INDEX "domain_outbox_aggregate_idx" ON "domain_outbox" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_travel_plan_per_user" ON "travel_plan" USING btree ("user_id") WHERE "travel_plan"."status" in ('DRAFT','SEARCHING','MATCHED','IN_CIRCLE','LOCKED','IN_JOURNEY');--> statement-breakpoint
CREATE INDEX "travel_plan_user_idx" ON "travel_plan" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "travel_plan_status_idx" ON "travel_plan" USING btree ("status");--> statement-breakpoint
CREATE INDEX "travel_plan_destination_date_status_idx" ON "travel_plan" USING btree ("destination_camp_id","intended_travel_date","status");--> statement-breakpoint
CREATE INDEX "travel_plan_origin_lga_idx" ON "travel_plan" USING btree ("origin_lga_id");--> statement-breakpoint
CREATE INDEX "travel_plan_departure_idx" ON "travel_plan" USING btree ("departure_window");--> statement-breakpoint
CREATE INDEX "travel_plan_transport_idx" ON "travel_plan" USING btree ("transport_mode");