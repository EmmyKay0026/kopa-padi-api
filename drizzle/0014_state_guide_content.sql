ALTER TYPE "public"."audit_action" ADD VALUE 'STATE_GUIDE_UPDATED' BEFORE 'VIEWED_VERIFICATION_DOCUMENT';--> statement-breakpoint
CREATE TABLE "state_guide_expectation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "state_guide_expectation_position_check" CHECK ("state_guide_expectation"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "state_guide_life" (
	"state_id" text PRIMARY KEY NOT NULL,
	"spoken_languages" text NOT NULL,
	"cultural_highlights" text NOT NULL,
	"local_food" text NOT NULL,
	"places_to_visit" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "state_guide_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_id" text NOT NULL,
	"src" text NOT NULL,
	"alt" text NOT NULL,
	"caption" text NOT NULL,
	"illustrative" boolean DEFAULT true NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "state_guide_photo_position_check" CHECK ("state_guide_photo"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "state_guide_secretariat" (
	"state_id" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"phone_number" text NOT NULL,
	"email" text NOT NULL,
	"source_url" text NOT NULL,
	"google_maps_url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "state_guide_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_id" text NOT NULL,
	"category" text NOT NULL,
	"url" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "state_guide_source_position_check" CHECK ("state_guide_source"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "state_guide_travel" (
	"state_id" text PRIMARY KEY NOT NULL,
	"weather_and_climate" text NOT NULL,
	"transport_options" text NOT NULL,
	"travel_safety_notes" text NOT NULL,
	"cost_of_living" text NOT NULL,
	"pcm_tips" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "state_guide" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"state_id" text PRIMARY KEY NOT NULL,
	"capital" text NOT NULL,
	"geopolitical_zone" text NOT NULL,
	"overview" text NOT NULL,
	"reviewed_on" date NOT NULL,
	"review_status" text NOT NULL,
	"research_notes" text NOT NULL,
	"source_caveats" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dynamic_fields_require_refresh" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "state_guide_id_unique" UNIQUE("id"),
	CONSTRAINT "state_guide_version_check" CHECK ("state_guide"."version" > 0),
	CONSTRAINT "state_guide_review_status_check" CHECK ("state_guide"."review_status" in ('draft', 'researched_editorial_draft_requires_local_verification', 'verified'))
);
--> statement-breakpoint
ALTER TABLE "state_guide_expectation" ADD CONSTRAINT "state_guide_expectation_state_id_state_guide_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."state_guide"("state_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "state_guide_life" ADD CONSTRAINT "state_guide_life_state_id_state_guide_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."state_guide"("state_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "state_guide_photo" ADD CONSTRAINT "state_guide_photo_state_id_state_guide_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."state_guide"("state_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "state_guide_secretariat" ADD CONSTRAINT "state_guide_secretariat_state_id_state_guide_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."state_guide"("state_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "state_guide_source" ADD CONSTRAINT "state_guide_source_state_id_state_guide_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."state_guide"("state_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "state_guide_travel" ADD CONSTRAINT "state_guide_travel_state_id_state_guide_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."state_guide"("state_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "state_guide" ADD CONSTRAINT "state_guide_state_id_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."state"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "state_guide" ADD CONSTRAINT "state_guide_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "state_guide_expectation_position_uq" ON "state_guide_expectation" USING btree ("state_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "state_guide_photo_position_uq" ON "state_guide_photo" USING btree ("state_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "state_guide_source_position_uq" ON "state_guide_source" USING btree ("state_id","category","position");