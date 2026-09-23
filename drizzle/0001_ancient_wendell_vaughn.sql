CREATE TYPE "public"."geography_source" AS ENUM('OSRM', 'MANUAL_REVIEW', 'OPENSTREETMAP', 'IMPORTED_DATASET');--> statement-breakpoint
CREATE TYPE "public"."travel_hub_status" AS ENUM('ACTIVE', 'INACTIVE', 'REVIEW_REQUIRED');--> statement-breakpoint
CREATE TYPE "public"."travel_hub_type" AS ENUM('LOCAL', 'REGIONAL', 'INTERSTATE', 'DESTINATION_GATEWAY');--> statement-breakpoint
ALTER TYPE "public"."orientation_camp_status" ADD VALUE 'TEMPORARY' BEFORE 'INACTIVE';--> statement-breakpoint
CREATE TABLE "lga_proximity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lga_a_id" text NOT NULL,
	"lga_b_id" text NOT NULL,
	"estimated_road_minutes" integer NOT NULL,
	"estimated_road_distance_km" numeric(8, 2),
	"common_hub_id" uuid,
	"is_nearby" boolean NOT NULL,
	"source" "geography_source" NOT NULL,
	"calculated_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lga_pair_order_check" CHECK ("lga_proximity"."lga_a_id" < "lga_proximity"."lga_b_id"),
	CONSTRAINT "proximity_minutes_nonnegative" CHECK ("lga_proximity"."estimated_road_minutes" >= 0),
	CONSTRAINT "proximity_distance_nonnegative" CHECK ("lga_proximity"."estimated_road_distance_km" IS NULL OR "lga_proximity"."estimated_road_distance_km" >= 0),
	CONSTRAINT "proximity_nearby_derived" CHECK ("lga_proximity"."is_nearby" = ("lga_proximity"."estimated_road_minutes" <= 60))
);
--> statement-breakpoint
CREATE TABLE "lga" (
	"id" text PRIMARY KEY NOT NULL,
	"state_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"is_active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'Open Admin Data CC-BY-4.0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lga_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "state" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"is_active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'Open Admin Data CC-BY-4.0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "state_name_unique" UNIQUE("name"),
	CONSTRAINT "state_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "town" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lga_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"is_major" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"source" "geography_source" DEFAULT 'MANUAL_REVIEW' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "travel_hub_lga" (
	"travel_hub_id" uuid NOT NULL,
	"lga_id" text NOT NULL,
	"estimated_minutes" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"source" "geography_source" NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "travel_hub_lga_travel_hub_id_lga_id_pk" PRIMARY KEY("travel_hub_id","lga_id"),
	CONSTRAINT "hub_minutes_nonnegative" CHECK ("travel_hub_lga"."estimated_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "travel_hub" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"state_id" text NOT NULL,
	"lga_id" text,
	"town_id" uuid,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"hub_type" "travel_hub_type" NOT NULL,
	"status" "travel_hub_status" DEFAULT 'REVIEW_REQUIRED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orientation_camp" ADD COLUMN "state_id" text;--> statement-breakpoint
ALTER TABLE "orientation_camp" ADD COLUMN "lga_id" text;--> statement-breakpoint
ALTER TABLE "orientation_camp" ADD COLUMN "latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "orientation_camp" ADD COLUMN "longitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "orientation_camp" ADD COLUMN "source_reference" text;--> statement-breakpoint
ALTER TABLE "orientation_camp" ADD COLUMN "last_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lga_proximity" ADD CONSTRAINT "lga_proximity_lga_a_id_lga_id_fk" FOREIGN KEY ("lga_a_id") REFERENCES "public"."lga"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lga_proximity" ADD CONSTRAINT "lga_proximity_lga_b_id_lga_id_fk" FOREIGN KEY ("lga_b_id") REFERENCES "public"."lga"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lga_proximity" ADD CONSTRAINT "lga_proximity_common_hub_id_travel_hub_id_fk" FOREIGN KEY ("common_hub_id") REFERENCES "public"."travel_hub"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lga" ADD CONSTRAINT "lga_state_id_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."state"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "town" ADD CONSTRAINT "town_lga_id_lga_id_fk" FOREIGN KEY ("lga_id") REFERENCES "public"."lga"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_hub_lga" ADD CONSTRAINT "travel_hub_lga_travel_hub_id_travel_hub_id_fk" FOREIGN KEY ("travel_hub_id") REFERENCES "public"."travel_hub"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_hub_lga" ADD CONSTRAINT "travel_hub_lga_lga_id_lga_id_fk" FOREIGN KEY ("lga_id") REFERENCES "public"."lga"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_hub" ADD CONSTRAINT "travel_hub_state_id_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."state"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_hub" ADD CONSTRAINT "travel_hub_lga_id_lga_id_fk" FOREIGN KEY ("lga_id") REFERENCES "public"."lga"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_hub" ADD CONSTRAINT "travel_hub_town_id_town_id_fk" FOREIGN KEY ("town_id") REFERENCES "public"."town"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lga_proximity_pair_uq" ON "lga_proximity" USING btree ("lga_a_id","lga_b_id");--> statement-breakpoint
CREATE INDEX "lga_proximity_a_idx" ON "lga_proximity" USING btree ("lga_a_id");--> statement-breakpoint
CREATE INDEX "lga_proximity_b_idx" ON "lga_proximity" USING btree ("lga_b_id");--> statement-breakpoint
CREATE INDEX "lga_proximity_nearby_idx" ON "lga_proximity" USING btree ("is_nearby");--> statement-breakpoint
CREATE UNIQUE INDEX "lga_state_name_uq" ON "lga" USING btree ("state_id","name");--> statement-breakpoint
CREATE INDEX "lga_state_idx" ON "lga" USING btree ("state_id");--> statement-breakpoint
CREATE UNIQUE INDEX "town_lga_name_uq" ON "town" USING btree ("lga_id","name");--> statement-breakpoint
CREATE INDEX "town_lga_idx" ON "town" USING btree ("lga_id");--> statement-breakpoint
CREATE INDEX "hub_lga_lga_idx" ON "travel_hub_lga" USING btree ("lga_id");--> statement-breakpoint
CREATE INDEX "hub_lga_hub_idx" ON "travel_hub_lga" USING btree ("travel_hub_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_primary_hub_per_lga" ON "travel_hub_lga" USING btree ("lga_id") WHERE "travel_hub_lga"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "travel_hub_state_name_uq" ON "travel_hub" USING btree ("state_id","name");--> statement-breakpoint
CREATE INDEX "travel_hub_state_idx" ON "travel_hub" USING btree ("state_id");--> statement-breakpoint
ALTER TABLE "orientation_camp" ADD CONSTRAINT "orientation_camp_state_id_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."state"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orientation_camp" ADD CONSTRAINT "orientation_camp_lga_id_lga_id_fk" FOREIGN KEY ("lga_id") REFERENCES "public"."lga"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orientation_camp_state_idx" ON "orientation_camp" USING btree ("state_id");--> statement-breakpoint
CREATE INDEX "orientation_camp_lga_idx" ON "orientation_camp" USING btree ("lga_id");--> statement-breakpoint
ALTER TABLE "orientation_camp" ADD CONSTRAINT "camp_lga_requires_state" CHECK ("orientation_camp"."lga_id" IS NULL OR "orientation_camp"."state_id" IS NOT NULL);