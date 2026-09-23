CREATE TYPE "public"."journey_checkin_type" AS ENUM('STARTED', 'SAFE', 'CONNECTION_REACHED', 'NEAR_DESTINATION', 'ARRIVED', 'NEED_HELP');--> statement-breakpoint
CREATE TYPE "public"."journey_mode" AS ENUM('CIRCLE', 'SOLO');--> statement-breakpoint
CREATE TYPE "public"."journey_share_status" AS ENUM('ACTIVE', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."journey_status" AS ENUM('PREPARING', 'READY_TO_START', 'IN_PROGRESS', 'NEEDS_ATTENTION', 'ARRIVED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."location_share_audience" AS ENUM('TRUSTED_CONTACT', 'CIRCLE');--> statement-breakpoint
CREATE TABLE "journey_check_in" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "journey_checkin_type" NOT NULL,
	"client_request_id" uuid NOT NULL,
	"message" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journey_checkin_message_check" CHECK ("journey_check_in"."message" IS NULL OR char_length("journey_check_in"."message") <= 300),
	CONSTRAINT "journey_checkin_location_check" CHECK (("journey_check_in"."latitude" IS NULL AND "journey_check_in"."longitude" IS NULL) OR ("journey_check_in"."latitude" between -90 and 90 AND "journey_check_in"."longitude" between -180 and 180))
);
--> statement-breakpoint
CREATE TABLE "journey_location_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_id" uuid NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"audience" "location_share_audience" NOT NULL,
	"purpose" text DEFAULT 'EMERGENCY' NOT NULL,
	"shared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "journey_location_bounds_check" CHECK ("journey_location_share"."latitude" between -90 and 90 AND "journey_location_share"."longitude" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "journey_reminder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_id" uuid NOT NULL,
	"reminder_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journey_safety_checklist" (
	"journey_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"label" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "journey_safety_checklist_journey_id_item_key_pk" PRIMARY KEY("journey_id","item_key")
);
--> statement-breakpoint
CREATE TABLE "journey_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_id" uuid NOT NULL,
	"trusted_contact_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" "journey_share_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "journey" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"travel_plan_id" uuid NOT NULL,
	"travel_circle_id" uuid,
	"origin_state_id" text NOT NULL,
	"origin_lga_id" text NOT NULL,
	"origin_town_id" uuid,
	"destination_camp_id" uuid NOT NULL,
	"travel_date" date NOT NULL,
	"departure_window" "departure_window" NOT NULL,
	"transport_mode" "transport_mode" NOT NULL,
	"journey_mode" "journey_mode" NOT NULL,
	"status" "journey_status" DEFAULT 'PREPARING' NOT NULL,
	"started_at" timestamp with time zone,
	"expected_arrival_at" timestamp with time zone,
	"last_check_in_at" timestamp with time zone,
	"last_safe_at" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journey_started_check" CHECK ("journey"."status" not in ('IN_PROGRESS','NEEDS_ATTENTION','ARRIVED','COMPLETED') OR "journey"."started_at" IS NOT NULL),
	CONSTRAINT "journey_arrived_check" CHECK ("journey"."status" not in ('ARRIVED','COMPLETED') OR "journey"."arrived_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "trusted_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"relationship" text NOT NULL,
	"phone" text,
	"email" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trusted_contact_method_check" CHECK ("trusted_contact"."phone" IS NOT NULL OR "trusted_contact"."email" IS NOT NULL),
	CONSTRAINT "trusted_contact_length_check" CHECK (char_length("trusted_contact"."name") between 2 and 100 AND char_length("trusted_contact"."relationship") between 2 and 80)
);
--> statement-breakpoint
ALTER TABLE "journey_check_in" ADD CONSTRAINT "journey_check_in_journey_id_journey_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journey"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_check_in" ADD CONSTRAINT "journey_check_in_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_location_share" ADD CONSTRAINT "journey_location_share_journey_id_journey_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journey"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_reminder" ADD CONSTRAINT "journey_reminder_journey_id_journey_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journey"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_safety_checklist" ADD CONSTRAINT "journey_safety_checklist_journey_id_journey_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journey"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_share" ADD CONSTRAINT "journey_share_journey_id_journey_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journey"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_share" ADD CONSTRAINT "journey_share_trusted_contact_id_trusted_contact_id_fk" FOREIGN KEY ("trusted_contact_id") REFERENCES "public"."trusted_contact"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey" ADD CONSTRAINT "journey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey" ADD CONSTRAINT "journey_travel_plan_id_travel_plan_id_fk" FOREIGN KEY ("travel_plan_id") REFERENCES "public"."travel_plan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey" ADD CONSTRAINT "journey_travel_circle_id_travel_circle_id_fk" FOREIGN KEY ("travel_circle_id") REFERENCES "public"."travel_circle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey" ADD CONSTRAINT "journey_origin_state_id_state_id_fk" FOREIGN KEY ("origin_state_id") REFERENCES "public"."state"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey" ADD CONSTRAINT "journey_origin_lga_id_lga_id_fk" FOREIGN KEY ("origin_lga_id") REFERENCES "public"."lga"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey" ADD CONSTRAINT "journey_origin_town_id_town_id_fk" FOREIGN KEY ("origin_town_id") REFERENCES "public"."town"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey" ADD CONSTRAINT "journey_destination_camp_id_orientation_camp_id_fk" FOREIGN KEY ("destination_camp_id") REFERENCES "public"."orientation_camp"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_contact" ADD CONSTRAINT "trusted_contact_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journey_checkin_request_uq" ON "journey_check_in" USING btree ("journey_id","client_request_id");--> statement-breakpoint
CREATE INDEX "journey_checkin_cursor_idx" ON "journey_check_in" USING btree ("journey_id","created_at","id");--> statement-breakpoint
CREATE INDEX "journey_location_current_idx" ON "journey_location_share" USING btree ("journey_id","audience","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_reminder_dedupe_uq" ON "journey_reminder" USING btree ("journey_id","reminder_number");--> statement-breakpoint
CREATE INDEX "journey_reminder_created_idx" ON "journey_reminder" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_share_token_uq" ON "journey_share" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_share_per_contact_journey" ON "journey_share" USING btree ("journey_id","trusted_contact_id") WHERE "journey_share"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "journey_share_journey_status_idx" ON "journey_share" USING btree ("journey_id","status");--> statement-breakpoint
CREATE INDEX "journey_share_expiry_idx" ON "journey_share" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_journey_per_user" ON "journey" USING btree ("user_id") WHERE "journey"."status" in ('PREPARING','READY_TO_START','IN_PROGRESS','NEEDS_ATTENTION','ARRIVED');--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_journey_per_plan" ON "journey" USING btree ("travel_plan_id") WHERE "journey"."status" in ('PREPARING','READY_TO_START','IN_PROGRESS','NEEDS_ATTENTION','ARRIVED');--> statement-breakpoint
CREATE INDEX "journey_user_status_idx" ON "journey" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "journey_plan_idx" ON "journey" USING btree ("travel_plan_id");--> statement-breakpoint
CREATE INDEX "journey_circle_status_idx" ON "journey" USING btree ("travel_circle_id","status");--> statement-breakpoint
CREATE INDEX "trusted_contact_user_active_idx" ON "trusted_contact" USING btree ("user_id","is_active");