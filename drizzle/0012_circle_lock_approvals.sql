CREATE TABLE "circle_lock_request" (
	"travel_circle_id" uuid PRIMARY KEY NOT NULL,
	"snapshot" text NOT NULL,
	"approvals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "circle_lock_request" ADD CONSTRAINT "circle_lock_request_travel_circle_id_travel_circle_id_fk" FOREIGN KEY ("travel_circle_id") REFERENCES "public"."travel_circle"("id") ON DELETE cascade ON UPDATE no action;