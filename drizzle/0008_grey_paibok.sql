CREATE TYPE "public"."final_connection_response" AS ENUM('YES', 'NO', 'NOT_SURE');--> statement-breakpoint
CREATE TYPE "public"."guide_accuracy_response" AS ENUM('YES', 'MOSTLY', 'NO');--> statement-breakpoint
CREATE TYPE "public"."guide_confidence" AS ENUM('HIGH', 'MEDIUM', 'LOW', 'UNVERIFIED');--> statement-breakpoint
CREATE TYPE "public"."guide_feedback_issue" AS ENUM('ROUTE_CHANGED', 'HUB_INCORRECT', 'FINAL_CONNECTION_INCORRECT', 'DURATION_INACCURATE', 'INSTRUCTION_UNCLEAR', 'SAFETY_CONCERN', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."guide_origin_scope" AS ENUM('TOWN', 'LGA', 'TRAVEL_HUB', 'STATE_AREA');--> statement-breakpoint
CREATE TYPE "public"."guide_source_type" AS ENUM('OFFICIAL_NYSC', 'OPENSTREETMAP', 'OSRM', 'ADMIN_RESEARCH', 'TRAVELLER_FEEDBACK', 'MANUAL_REVIEW', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."journey_guide_status" AS ENUM('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'NEEDS_REVIEW', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."guide_transport_mode" AS ENUM('COMMERCIAL_BUS', 'TRAIN', 'FLIGHT', 'LOCAL_TRANSIT', 'WALK', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."journey_leg_type" AS ENUM('LOCAL_TO_ORIGIN_HUB', 'INTERCITY', 'REGIONAL_TRANSFER', 'DESTINATION_ARRIVAL', 'FINAL_CAMP_CONNECTION', 'OTHER');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'JOURNEY_GUIDE_CREATED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'JOURNEY_GUIDE_EDITED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'JOURNEY_GUIDE_SUBMITTED_FOR_REVIEW';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'JOURNEY_GUIDE_PUBLISHED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'JOURNEY_GUIDE_RETIRED';--> statement-breakpoint
CREATE TABLE "journey_guide_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_id" uuid NOT NULL,
	"journey_guide_id" uuid NOT NULL,
	"journey_guide_version" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"was_useful" boolean NOT NULL,
	"was_accurate" "guide_accuracy_response" NOT NULL,
	"final_connection_accurate" "final_connection_response",
	"issue_type" "guide_feedback_issue",
	"comment" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_feedback_version_positive" CHECK ("journey_guide_feedback"."journey_guide_version" > 0),
	CONSTRAINT "guide_feedback_comment_check" CHECK ("journey_guide_feedback"."comment" IS NULL OR char_length("journey_guide_feedback"."comment") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "journey_guide_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_guide_id" uuid NOT NULL,
	"journey_leg_id" uuid,
	"source_type" "guide_source_type" NOT NULL,
	"title" text NOT NULL,
	"reference" text NOT NULL,
	"source_date" date,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_source_text_check" CHECK (char_length("journey_guide_source"."title") between 2 and 200 AND char_length("journey_guide_source"."reference") between 3 and 1000)
);
--> statement-breakpoint
CREATE TABLE "journey_guide" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin_scope_type" "guide_origin_scope" NOT NULL,
	"origin_state_id" text,
	"origin_lga_id" text,
	"origin_town_id" uuid,
	"origin_hub_id" uuid,
	"destination_camp_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"alternative_notes" text,
	"status" "journey_guide_status" DEFAULT 'DRAFT' NOT NULL,
	"confidence_level" "guide_confidence" DEFAULT 'UNVERIFIED' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"last_reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "guide_version_positive" CHECK ("journey_guide"."version" > 0),
	CONSTRAINT "guide_origin_scope_check" CHECK (("journey_guide"."origin_scope_type"='TOWN' AND "journey_guide"."origin_town_id" IS NOT NULL AND "journey_guide"."origin_lga_id" IS NULL AND "journey_guide"."origin_hub_id" IS NULL) OR ("journey_guide"."origin_scope_type"='LGA' AND "journey_guide"."origin_lga_id" IS NOT NULL AND "journey_guide"."origin_town_id" IS NULL AND "journey_guide"."origin_hub_id" IS NULL) OR ("journey_guide"."origin_scope_type"='TRAVEL_HUB' AND "journey_guide"."origin_hub_id" IS NOT NULL AND "journey_guide"."origin_town_id" IS NULL AND "journey_guide"."origin_lga_id" IS NULL) OR ("journey_guide"."origin_scope_type"='STATE_AREA' AND "journey_guide"."origin_state_id" IS NOT NULL AND "journey_guide"."origin_town_id" IS NULL AND "journey_guide"."origin_lga_id" IS NULL AND "journey_guide"."origin_hub_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "journey_leg" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_guide_id" uuid NOT NULL,
	"sequence_number" integer NOT NULL,
	"leg_type" "journey_leg_type" NOT NULL,
	"from_label" text NOT NULL,
	"to_label" text NOT NULL,
	"from_state_id" text,
	"from_lga_id" text,
	"from_town_id" uuid,
	"from_hub_id" uuid,
	"to_state_id" text,
	"to_lga_id" text,
	"to_town_id" uuid,
	"to_hub_id" uuid,
	"to_camp_id" uuid,
	"transport_mode" "guide_transport_mode",
	"instruction" text NOT NULL,
	"connection_notes" text,
	"safety_notes" text,
	"estimated_duration_minutes" integer,
	"estimated_distance_km" numeric(8, 2),
	"confidence_level" "guide_confidence" NOT NULL,
	"source_type" "guide_source_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_leg_sequence_positive" CHECK ("journey_leg"."sequence_number" > 0),
	CONSTRAINT "guide_leg_instruction_check" CHECK (char_length("journey_leg"."instruction") between 3 and 2000),
	CONSTRAINT "guide_leg_estimates_check" CHECK (("journey_leg"."estimated_duration_minutes" IS NULL OR "journey_leg"."estimated_duration_minutes" > 0) AND ("journey_leg"."estimated_distance_km" IS NULL OR "journey_leg"."estimated_distance_km" > 0))
);
--> statement-breakpoint
ALTER TABLE "journey" ADD COLUMN "journey_guide_id" uuid;--> statement-breakpoint
ALTER TABLE "journey" ADD COLUMN "journey_guide_version" integer;--> statement-breakpoint
ALTER TABLE "journey_guide_feedback" ADD CONSTRAINT "journey_guide_feedback_journey_id_journey_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journey"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_guide_feedback" ADD CONSTRAINT "journey_guide_feedback_journey_guide_id_journey_guide_id_fk" FOREIGN KEY ("journey_guide_id") REFERENCES "public"."journey_guide"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_guide_feedback" ADD CONSTRAINT "journey_guide_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_guide_source" ADD CONSTRAINT "journey_guide_source_journey_guide_id_journey_guide_id_fk" FOREIGN KEY ("journey_guide_id") REFERENCES "public"."journey_guide"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_guide_source" ADD CONSTRAINT "journey_guide_source_journey_leg_id_journey_leg_id_fk" FOREIGN KEY ("journey_leg_id") REFERENCES "public"."journey_leg"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_guide" ADD CONSTRAINT "journey_guide_origin_state_id_state_id_fk" FOREIGN KEY ("origin_state_id") REFERENCES "public"."state"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_guide" ADD CONSTRAINT "journey_guide_origin_lga_id_lga_id_fk" FOREIGN KEY ("origin_lga_id") REFERENCES "public"."lga"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_guide" ADD CONSTRAINT "journey_guide_origin_town_id_town_id_fk" FOREIGN KEY ("origin_town_id") REFERENCES "public"."town"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_guide" ADD CONSTRAINT "journey_guide_origin_hub_id_travel_hub_id_fk" FOREIGN KEY ("origin_hub_id") REFERENCES "public"."travel_hub"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_guide" ADD CONSTRAINT "journey_guide_destination_camp_id_orientation_camp_id_fk" FOREIGN KEY ("destination_camp_id") REFERENCES "public"."orientation_camp"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_guide" ADD CONSTRAINT "journey_guide_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_guide" ADD CONSTRAINT "journey_guide_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_leg" ADD CONSTRAINT "journey_leg_journey_guide_id_journey_guide_id_fk" FOREIGN KEY ("journey_guide_id") REFERENCES "public"."journey_guide"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_leg" ADD CONSTRAINT "journey_leg_from_state_id_state_id_fk" FOREIGN KEY ("from_state_id") REFERENCES "public"."state"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_leg" ADD CONSTRAINT "journey_leg_from_lga_id_lga_id_fk" FOREIGN KEY ("from_lga_id") REFERENCES "public"."lga"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_leg" ADD CONSTRAINT "journey_leg_from_town_id_town_id_fk" FOREIGN KEY ("from_town_id") REFERENCES "public"."town"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_leg" ADD CONSTRAINT "journey_leg_from_hub_id_travel_hub_id_fk" FOREIGN KEY ("from_hub_id") REFERENCES "public"."travel_hub"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_leg" ADD CONSTRAINT "journey_leg_to_state_id_state_id_fk" FOREIGN KEY ("to_state_id") REFERENCES "public"."state"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_leg" ADD CONSTRAINT "journey_leg_to_lga_id_lga_id_fk" FOREIGN KEY ("to_lga_id") REFERENCES "public"."lga"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_leg" ADD CONSTRAINT "journey_leg_to_town_id_town_id_fk" FOREIGN KEY ("to_town_id") REFERENCES "public"."town"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_leg" ADD CONSTRAINT "journey_leg_to_hub_id_travel_hub_id_fk" FOREIGN KEY ("to_hub_id") REFERENCES "public"."travel_hub"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_leg" ADD CONSTRAINT "journey_leg_to_camp_id_orientation_camp_id_fk" FOREIGN KEY ("to_camp_id") REFERENCES "public"."orientation_camp"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_guide_feedback_per_journey_version" ON "journey_guide_feedback" USING btree ("journey_id","journey_guide_id","journey_guide_version");--> statement-breakpoint
CREATE INDEX "guide_feedback_guide_date_idx" ON "journey_guide_feedback" USING btree ("journey_guide_id","submitted_at");--> statement-breakpoint
CREATE INDEX "guide_source_guide_idx" ON "journey_guide_source" USING btree ("journey_guide_id");--> statement-breakpoint
CREATE INDEX "guide_destination_status_idx" ON "journey_guide" USING btree ("destination_camp_id","status");--> statement-breakpoint
CREATE INDEX "guide_lga_destination_status_idx" ON "journey_guide" USING btree ("origin_lga_id","destination_camp_id","status");--> statement-breakpoint
CREATE INDEX "guide_hub_destination_status_idx" ON "journey_guide" USING btree ("origin_hub_id","destination_camp_id","status");--> statement-breakpoint
CREATE INDEX "guide_town_destination_status_idx" ON "journey_guide" USING btree ("origin_town_id","destination_camp_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "guide_scope_version_uq" ON "journey_guide" USING btree ("origin_scope_type","origin_state_id","origin_lga_id","origin_town_id","origin_hub_id","destination_camp_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "guide_leg_sequence_uq" ON "journey_leg" USING btree ("journey_guide_id","sequence_number");--> statement-breakpoint
CREATE INDEX "guide_leg_order_idx" ON "journey_leg" USING btree ("journey_guide_id","sequence_number");--> statement-breakpoint
ALTER TABLE "journey" ADD CONSTRAINT "journey_journey_guide_id_journey_guide_id_fk" FOREIGN KEY ("journey_guide_id") REFERENCES "public"."journey_guide"("id") ON DELETE set null ON UPDATE no action;