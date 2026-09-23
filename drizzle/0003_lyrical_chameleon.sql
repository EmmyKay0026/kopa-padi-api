CREATE TYPE "public"."circle_membership_status" AS ENUM('JOINED', 'CONFIRMED', 'LEFT', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."journey_cohort_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."match_offer_status" AS ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."match_offer_type" AS ENUM('ALTERNATIVE_DATE', 'ALTERNATIVE_TIME', 'ALTERNATIVE_TRANSPORT', 'COMMON_HUB', 'NEARBY_ORIGIN');--> statement-breakpoint
CREATE TYPE "public"."match_result_type" AS ENUM('NO_MATCH', 'JOINED_EXISTING_CIRCLE', 'CREATED_FORMING_CIRCLE', 'ALTERNATIVE_OFFER_CREATED', 'ALREADY_MATCHED', 'INELIGIBLE');--> statement-breakpoint
CREATE TYPE "public"."matching_restriction_type" AS ENUM('MATCHING_DISABLED', 'TRAVEL_PLAN_DISABLED');--> statement-breakpoint
CREATE TYPE "public"."travel_circle_status" AS ENUM('FORMING', 'READY', 'FULL', 'LOCKED', 'IN_JOURNEY', 'ARRIVED', 'CLOSED', 'DISSOLVED');--> statement-breakpoint
CREATE TABLE "journey_cohort" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin_hub_id" uuid,
	"destination_camp_id" uuid NOT NULL,
	"travel_date" date NOT NULL,
	"departure_window" "departure_window" NOT NULL,
	"transport_mode" "transport_mode" NOT NULL,
	"status" "journey_cohort_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"travel_plan_id" uuid NOT NULL,
	"algorithm_version" text NOT NULL,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"direct_candidate_count" integer DEFAULT 0 NOT NULL,
	"alternative_candidate_count" integer DEFAULT 0 NOT NULL,
	"result_type" "match_result_type" NOT NULL,
	"selected_circle_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_offer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"travel_plan_id" uuid NOT NULL,
	"candidate_travel_plan_id" uuid,
	"proposed_circle_id" uuid,
	"offer_type" "match_offer_type" NOT NULL,
	"proposed_travel_date" date,
	"proposed_departure_window" "departure_window",
	"proposed_transport_mode" "transport_mode",
	"proposed_origin_hub_id" uuid,
	"status" "match_offer_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "matching_restriction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "matching_restriction_type" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"reason_private" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "travel_circle_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"travel_circle_id" uuid NOT NULL,
	"travel_plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"membership_status" "circle_membership_status" DEFAULT 'JOINED' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	CONSTRAINT "circle_member_exit_timestamp_check" CHECK (("travel_circle_member"."membership_status" <> 'LEFT' OR "travel_circle_member"."left_at" IS NOT NULL) AND ("travel_circle_member"."membership_status" <> 'REMOVED' OR "travel_circle_member"."removed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "travel_circle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_cohort_id" uuid,
	"origin_hub_id" uuid,
	"origin_lga_id" text NOT NULL,
	"origin_town_id" uuid,
	"destination_camp_id" uuid NOT NULL,
	"travel_date" date NOT NULL,
	"departure_window" "departure_window" NOT NULL,
	"transport_mode" "transport_mode" NOT NULL,
	"status" "travel_circle_status" DEFAULT 'FORMING' NOT NULL,
	"max_members" integer DEFAULT 6 NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "travel_circle_capacity_check" CHECK ("travel_circle"."max_members" between 2 and 6 AND "travel_circle"."member_count" between 0 and "travel_circle"."max_members")
);
--> statement-breakpoint
CREATE TABLE "user_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_user_id" uuid NOT NULL,
	"blocked_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_block_not_self" CHECK ("user_block"."blocker_user_id" <> "user_block"."blocked_user_id")
);
--> statement-breakpoint
ALTER TABLE "journey_cohort" ADD CONSTRAINT "journey_cohort_origin_hub_id_travel_hub_id_fk" FOREIGN KEY ("origin_hub_id") REFERENCES "public"."travel_hub"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_cohort" ADD CONSTRAINT "journey_cohort_destination_camp_id_orientation_camp_id_fk" FOREIGN KEY ("destination_camp_id") REFERENCES "public"."orientation_camp"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_attempt" ADD CONSTRAINT "match_attempt_travel_plan_id_travel_plan_id_fk" FOREIGN KEY ("travel_plan_id") REFERENCES "public"."travel_plan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_attempt" ADD CONSTRAINT "match_attempt_selected_circle_id_travel_circle_id_fk" FOREIGN KEY ("selected_circle_id") REFERENCES "public"."travel_circle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_offer" ADD CONSTRAINT "match_offer_travel_plan_id_travel_plan_id_fk" FOREIGN KEY ("travel_plan_id") REFERENCES "public"."travel_plan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_offer" ADD CONSTRAINT "match_offer_candidate_travel_plan_id_travel_plan_id_fk" FOREIGN KEY ("candidate_travel_plan_id") REFERENCES "public"."travel_plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_offer" ADD CONSTRAINT "match_offer_proposed_circle_id_travel_circle_id_fk" FOREIGN KEY ("proposed_circle_id") REFERENCES "public"."travel_circle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_offer" ADD CONSTRAINT "match_offer_proposed_origin_hub_id_travel_hub_id_fk" FOREIGN KEY ("proposed_origin_hub_id") REFERENCES "public"."travel_hub"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matching_restriction" ADD CONSTRAINT "matching_restriction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_circle_member" ADD CONSTRAINT "travel_circle_member_travel_circle_id_travel_circle_id_fk" FOREIGN KEY ("travel_circle_id") REFERENCES "public"."travel_circle"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_circle_member" ADD CONSTRAINT "travel_circle_member_travel_plan_id_travel_plan_id_fk" FOREIGN KEY ("travel_plan_id") REFERENCES "public"."travel_plan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_circle_member" ADD CONSTRAINT "travel_circle_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_circle" ADD CONSTRAINT "travel_circle_journey_cohort_id_journey_cohort_id_fk" FOREIGN KEY ("journey_cohort_id") REFERENCES "public"."journey_cohort"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_circle" ADD CONSTRAINT "travel_circle_origin_hub_id_travel_hub_id_fk" FOREIGN KEY ("origin_hub_id") REFERENCES "public"."travel_hub"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_circle" ADD CONSTRAINT "travel_circle_origin_lga_id_lga_id_fk" FOREIGN KEY ("origin_lga_id") REFERENCES "public"."lga"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_circle" ADD CONSTRAINT "travel_circle_origin_town_id_town_id_fk" FOREIGN KEY ("origin_town_id") REFERENCES "public"."town"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_circle" ADD CONSTRAINT "travel_circle_destination_camp_id_orientation_camp_id_fk" FOREIGN KEY ("destination_camp_id") REFERENCES "public"."orientation_camp"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_block" ADD CONSTRAINT "user_block_blocker_user_id_user_id_fk" FOREIGN KEY ("blocker_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_block" ADD CONSTRAINT "user_block_blocked_user_id_user_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journey_cohort_lookup_idx" ON "journey_cohort" USING btree ("destination_camp_id","travel_date","status");--> statement-breakpoint
CREATE INDEX "match_attempt_plan_idx" ON "match_attempt" USING btree ("travel_plan_id","started_at");--> statement-breakpoint
CREATE INDEX "match_attempt_result_idx" ON "match_attempt" USING btree ("result_type","completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_pending_match_offer_per_plan" ON "match_offer" USING btree ("travel_plan_id") WHERE "match_offer"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "match_offer_plan_status_idx" ON "match_offer" USING btree ("travel_plan_id","status");--> statement-breakpoint
CREATE INDEX "match_offer_expiry_idx" ON "match_offer" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "matching_restriction_user_active_idx" ON "matching_restriction" USING btree ("user_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_circle_per_plan" ON "travel_circle_member" USING btree ("travel_plan_id") WHERE "travel_circle_member"."membership_status" in ('JOINED','CONFIRMED');--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_circle_per_user" ON "travel_circle_member" USING btree ("user_id") WHERE "travel_circle_member"."membership_status" in ('JOINED','CONFIRMED');--> statement-breakpoint
CREATE INDEX "circle_member_circle_status_idx" ON "travel_circle_member" USING btree ("travel_circle_id","membership_status");--> statement-breakpoint
CREATE INDEX "circle_member_plan_idx" ON "travel_circle_member" USING btree ("travel_plan_id");--> statement-breakpoint
CREATE INDEX "travel_circle_lookup_idx" ON "travel_circle" USING btree ("destination_camp_id","travel_date","status");--> statement-breakpoint
CREATE INDEX "travel_circle_route_idx" ON "travel_circle" USING btree ("destination_camp_id","transport_mode","departure_window","status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_block_pair_uq" ON "user_block" USING btree ("blocker_user_id","blocked_user_id");--> statement-breakpoint
CREATE INDEX "user_block_blocked_idx" ON "user_block" USING btree ("blocked_user_id");