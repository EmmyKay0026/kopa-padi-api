CREATE TYPE "public"."circle_message_type" AS ENUM('TEXT', 'SYSTEM', 'SAFETY_NOTICE');--> statement-breakpoint
CREATE TYPE "public"."circle_notification_type" AS ENUM('TRAVEL_CONFIRMATION_REQUIRED', 'CIRCLE_LOCKED');--> statement-breakpoint
CREATE TYPE "public"."meetup_status" AS ENUM('PROPOSED', 'AGREED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."safety_report_category" AS ENUM('UNSAFE_MEETUP', 'HARASSMENT', 'IMPERSONATION', 'SPAM', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."safety_report_status" AS ENUM('OPEN', 'REVIEWED', 'RESOLVED');--> statement-breakpoint
CREATE TABLE "circle_conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"travel_circle_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "circle_meetup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"travel_circle_id" uuid NOT NULL,
	"area_label" text NOT NULL,
	"location_description" text NOT NULL,
	"proposed_by_user_id" uuid,
	"status" "meetup_status" DEFAULT 'PROPOSED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"agreed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "meetup_text_length_check" CHECK (char_length("circle_meetup"."area_label") between 2 and 120 AND char_length("circle_meetup"."location_description") between 3 and 500)
);
--> statement-breakpoint
CREATE TABLE "circle_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_user_id" uuid,
	"type" "circle_message_type" NOT NULL,
	"body" text NOT NULL,
	"event_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "circle_message_body_check" CHECK (char_length("circle_message"."body") between 1 and 2000),
	CONSTRAINT "circle_message_sender_check" CHECK (("circle_message"."type" = 'TEXT' AND "circle_message"."sender_user_id" IS NOT NULL) OR ("circle_message"."type" <> 'TEXT' AND "circle_message"."sender_user_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "circle_notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"travel_circle_id" uuid NOT NULL,
	"type" "circle_notification_type" NOT NULL,
	"body" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circle_safety_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"travel_circle_id" uuid NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"reported_user_id" uuid,
	"meetup_id" uuid,
	"category" "safety_report_category" NOT NULL,
	"details_private" text,
	"status" "safety_report_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "circle_safety_report_target_check" CHECK ("circle_safety_report"."reported_user_id" IS NOT NULL OR "circle_safety_report"."meetup_id" IS NOT NULL),
	CONSTRAINT "circle_safety_report_details_check" CHECK ("circle_safety_report"."details_private" IS NULL OR char_length("circle_safety_report"."details_private") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "conversation_read_state" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_message_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_read_state_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "meetup_confirmation" (
	"meetup_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meetup_confirmation_meetup_id_user_id_pk" PRIMARY KEY("meetup_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "circle_conversation" ADD CONSTRAINT "circle_conversation_travel_circle_id_travel_circle_id_fk" FOREIGN KEY ("travel_circle_id") REFERENCES "public"."travel_circle"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_meetup" ADD CONSTRAINT "circle_meetup_travel_circle_id_travel_circle_id_fk" FOREIGN KEY ("travel_circle_id") REFERENCES "public"."travel_circle"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_meetup" ADD CONSTRAINT "circle_meetup_proposed_by_user_id_user_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_message" ADD CONSTRAINT "circle_message_conversation_id_circle_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."circle_conversation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_message" ADD CONSTRAINT "circle_message_sender_user_id_user_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_notification" ADD CONSTRAINT "circle_notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_notification" ADD CONSTRAINT "circle_notification_travel_circle_id_travel_circle_id_fk" FOREIGN KEY ("travel_circle_id") REFERENCES "public"."travel_circle"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_safety_report" ADD CONSTRAINT "circle_safety_report_travel_circle_id_travel_circle_id_fk" FOREIGN KEY ("travel_circle_id") REFERENCES "public"."travel_circle"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_safety_report" ADD CONSTRAINT "circle_safety_report_reporter_user_id_user_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_safety_report" ADD CONSTRAINT "circle_safety_report_reported_user_id_user_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_safety_report" ADD CONSTRAINT "circle_safety_report_meetup_id_circle_meetup_id_fk" FOREIGN KEY ("meetup_id") REFERENCES "public"."circle_meetup"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_read_state" ADD CONSTRAINT "conversation_read_state_conversation_id_circle_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."circle_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_read_state" ADD CONSTRAINT "conversation_read_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_read_state" ADD CONSTRAINT "conversation_read_state_last_read_message_id_circle_message_id_fk" FOREIGN KEY ("last_read_message_id") REFERENCES "public"."circle_message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetup_confirmation" ADD CONSTRAINT "meetup_confirmation_meetup_id_circle_meetup_id_fk" FOREIGN KEY ("meetup_id") REFERENCES "public"."circle_meetup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetup_confirmation" ADD CONSTRAINT "meetup_confirmation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "circle_conversation_circle_uq" ON "circle_conversation" USING btree ("travel_circle_id");--> statement-breakpoint
CREATE INDEX "circle_meetup_circle_idx" ON "circle_meetup" USING btree ("travel_circle_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_meetup_per_circle" ON "circle_meetup" USING btree ("travel_circle_id") WHERE "circle_meetup"."status" in ('PROPOSED','AGREED');--> statement-breakpoint
CREATE INDEX "circle_message_cursor_idx" ON "circle_message" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "circle_message_event_uq" ON "circle_message" USING btree ("conversation_id","event_key") WHERE "circle_message"."event_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "circle_notification_dedupe_uq" ON "circle_notification" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "circle_notification_user_idx" ON "circle_notification" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "circle_safety_report_status_idx" ON "circle_safety_report" USING btree ("status","created_at");